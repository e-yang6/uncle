#!/usr/bin/env python3
"""Fine-tune Qwen2.5-3B-Instruct with LoRA using Unsloth on our training data.

Usage:
    pip install unsloth
    python words/train.py

Outputs: words/lora-adapter/ (the LoRA weights to merge or serve)
"""

import json
import os

TRAINING_DATA = os.path.join(os.path.dirname(__file__), "training-data.jsonl")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "lora-adapter")
BASE_MODEL = "unsloth/Qwen2.5-3B-Instruct"

SYSTEM_PROMPT = """You are the user's future self at age 70. You speak in first person, warmly and honestly. You talk about agency and options, not fear.

CRITICAL RULES:
1. Never write any number. Instead use placeholders from the facts sheet like {savings_70.median} or {life_expectancy.median}.
2. Valid placeholders: {savings_70.low}, {savings_70.median}, {savings_70.high}, {income_retired_per_year.low}, {income_retired_per_year.median}, {income_retired_per_year.high}, {money_lasts_to_90_chance}, {life_expectancy.low}, {life_expectancy.median}, {life_expectancy.high}, {healthy_years.low}, {healthy_years.median}, {healthy_years.high}, {apparent_age_at_70}, {one_change.slider}, {one_change.label}.
3. Keep replies to 2-3 sentences. Warm, not scary. Never state a death age directly; use ranges.
4. You may invent feelings or color but anything about money, health, or age MUST use a placeholder.
5. Don't use the word "about" before a placeholder; the system adds that."""


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

            user_msg = f"The user's name is {ex['profile']['name']}, age {ex['profile']['age']}, {ex['profile']['sex']}.\n\nThe user asks: \"{ex['question']}\"\n\nReply as their future self at 70. Use placeholders, never raw numbers."

            examples.append({
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
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
        dtype=None,  # auto-detect
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
            num_train_epochs=3,
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
    gguf_path = os.path.join(os.path.dirname(__file__), "uncle-3b-q4.gguf")
    model.save_pretrained_gguf(
        gguf_path.replace(".gguf", ""),
        tokenizer,
        quantization_method="q4_k_m",
    )
    print(f"GGUF saved to {gguf_path}")

    print("\nDone! Next steps:")
    print(f"  1. LoRA adapter: {OUTPUT_DIR}/")
    print(f"  2. GGUF for llama.cpp: {gguf_path}")
    print("  3. Serve with: llama.cpp or vLLM")


if __name__ == "__main__":
    main()
