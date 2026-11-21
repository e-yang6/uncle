# voice/: the voice pipeline

Owner: Person 2. Spec: PLAN.md Part 4. Contracts: interview fields out (via Gemini), checked sentences in, aged audio out (CONTRACTS.md).

Lives here: the interview flow and recording, speech-to-text with end-of-speech detection, ElevenLabs Instant Voice Clone and streaming text-to-speech, our voice aging filter (pitch, wobble, pace, tone; breathiness was tried and cut because it sounded like a snare drum), saving each clone for returning judges, and the delay and listening tests.

Gemini writes replies by default. Fine-tuned model code and MODEL_URL are retained; MODEL_FIRST=1 explicitly opts back in. MODEL_FIRST=0 forces Gemini in both batch and streaming paths.
