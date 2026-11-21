#!/usr/bin/env python3
"""Fine-tune v2: train on the exact same prompt format used at inference.

Each training example uses the real system prompt from voice/chat.js
and the assistant reply is JSON: {"sentences": ["...", "..."]}.

Usage:
    pip install unsloth
    python words/train-v2.py [--data words/training-data-v2.jsonl]

Outputs: words/lora-adapter-v2/ and words/uncle-3b-v2-q4.gguf
"""

import json
import os
import sys

TRAINING_DATA = "words/training-data-v2.jsonl"
OUTPUT_DIR = "words/lora-adapter-v2"
BASE_MODEL = "unsloth/Qwen2.5-3B-Instruct"

for arg in sys.argv[1:]:
    if arg.startswith("--data="):
        TRAINING_DATA = arg.split("=", 1)[1]
    elif arg == "--data" and sys.argv.index(arg) + 1 < len(sys.argv):
        TRAINING_DATA = sys.argv[sys.argv.index(arg) + 1]


def load_data():
    examples = []
    with open(TRAINING_DATA, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            if not ex.get("valid"):
                continue

            examples.append({
                "messages": [
                    {"role": "system", "content": ex["system_prompt"]},
                    {"role": "user", "content": ex["user_message"]},
                    {"role": "assistant", "content": ex["reply"]},
                ]
            })
    return examples


def main():
    from unsloth import FastLanguageModel

    print(f"Loading {BASE_MODEL}...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                         "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    examples = load_data()
    print(f"Loaded {len(examples)} training examples")

    from unsloth.chat_templates import get_chat_template
    tokenizer = get_chat_template(tokenizer, chat_template="qwen-2.5")

    def format_example(ex):
        text = tokenizer.apply_chat_template(
            ex["messages"], tokenize=False, add_generation_prompt=False
        )
        return {"text": text}

    from datasets import Dataset
    dataset = Dataset.from_list([format_example(ex) for ex in examples])
    print(f"Dataset: {len(dataset)} examples")

    from trl import SFTTrainer
    from transformers import TrainingArguments

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=TrainingArguments(
            output_dir=OUTPUT_DIR + "-checkpoints",
            per_device_train_batch_size=4,
            gradient_accumulation_steps=4,
            warmup_steps=10,
            num_train_epochs=5,
            learning_rate=2e-4,
            bf16=True,
            logging_steps=10,
            save_strategy="epoch",
            seed=42,
        ),
        dataset_text_field="text",
        max_seq_length=2048,
    )

    print("Training...")
    stats = trainer.train()
    print(f"Training done. Loss: {stats.training_loss:.4f}")

    print(f"Saving LoRA adapter to {OUTPUT_DIR}...")
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    print("Saving merged GGUF for llama.cpp serving...")
    gguf_dir = "words/uncle-3b-v2"
    model.save_pretrained_gguf(
        gguf_dir,
        tokenizer,
        quantization_method="q4_k_m",
    )
    print(f"GGUF saved to {gguf_dir}")

    print("\nDone! Next steps:")
    print(f"  1. LoRA adapter: {OUTPUT_DIR}/")
    print(f"  2. Serve with vLLM: python -m vllm.entrypoints.openai.api_server --model {OUTPUT_DIR} --port 8000")


if __name__ == "__main__":
    main()
