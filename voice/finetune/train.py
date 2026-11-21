#!/usr/bin/env python3
"""LoRA fine-tune of Qwen2.5-3B-Instruct on voice/finetune/out/train.jsonl (made by gen-data.mjs).

Runs on BOTH cards of the 2 x A16 box with plain Hugging Face + PEFT (data parallel, bf16, no 4-bit):
    accelerate launch --num_processes 2 train.py --data train.jsonl --out /root/uncle-3b-v3 [--max-steps 20]

Only the assistant's words are learned (the system prompt and the user turns are masked out), and the
training prompt is the app's own prompt, so what the model sees here is what it sees at runtime.
Writes a MERGED model folder (safetensors + tokenizer + config) that vLLM can serve directly.
"""
import argparse, json, os, random
import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, DataCollatorForSeq2Seq

p = argparse.ArgumentParser()
p.add_argument("--data", required=True)
p.add_argument("--out", required=True)
p.add_argument("--base", default="Qwen/Qwen2.5-3B-Instruct")
p.add_argument("--epochs", type=float, default=2)
p.add_argument("--lr", type=float, default=2e-4)
p.add_argument("--max-len", type=int, default=1536)
p.add_argument("--max-steps", type=int, default=-1)
p.add_argument("--limit", type=int, default=0, help="use only the first N examples (speed tests)")
a = p.parse_args()

tok = AutoTokenizer.from_pretrained(a.base)
rows = [json.loads(l) for l in open(a.data) if l.strip()]
random.Random(42).shuffle(rows)
if a.limit:
    rows = rows[: a.limit]


def encode(row):
    """Token ids for the whole chat, with labels only on the LAST assistant message."""
    msgs = row["messages"]
    prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
    full = prompt + msgs[-1]["content"] + "<|im_end|>\n"
    p_ids = tok(prompt, add_special_tokens=False)["input_ids"]
    f_ids = tok(full, add_special_tokens=False)["input_ids"][: a.max_len]
    labels = ([-100] * len(p_ids) + f_ids[len(p_ids):])[: len(f_ids)]
    return {"input_ids": f_ids, "attention_mask": [1] * len(f_ids), "labels": labels}


ds = Dataset.from_list([encode(r) for r in rows])
split = ds.train_test_split(test_size=min(100, max(10, len(ds) // 20)), seed=1)
print(f"{len(split['train'])} train / {len(split['test'])} validation examples; mean length "
      f"{sum(len(x) for x in split['train']['input_ids']) / len(split['train']):.0f} tokens", flush=True)

model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.bfloat16)
model.gradient_checkpointing_enable()
model.enable_input_require_grads()
model = get_peft_model(model, LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.0, task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
model.print_trainable_parameters()

args = TrainingArguments(
    output_dir=a.out + "-checkpoints", per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=8,
    num_train_epochs=a.epochs, max_steps=a.max_steps, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_steps=10,
    bf16=True, logging_steps=5, eval_strategy="epoch", save_strategy="no", report_to=[], seed=42,
    ddp_find_unused_parameters=False, remove_unused_columns=False,
)
trainer = Trainer(model=model, args=args, train_dataset=split["train"], eval_dataset=split["test"],
                  data_collator=DataCollatorForSeq2Seq(tok, padding=True, label_pad_token_id=-100))
trainer.train()

if trainer.is_world_process_zero():
    merged = trainer.model.merge_and_unload()
    merged.save_pretrained(a.out, safe_serialization=True)
    tok.save_pretrained(a.out)
    print("MERGED MODEL SAVED:", a.out, flush=True)
