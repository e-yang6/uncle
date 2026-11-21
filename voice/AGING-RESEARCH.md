# Voice aging: what the research says, and how our filter compares

PLAN.md Part 4 asks us to check the filter's sizes against voice-aging research and cite it. This file is that check.
Written unattended on 2026-11-21 by Jeffrey's Claude. **No voice settings were changed.** Proposals are at the bottom, for Jeffrey to decide.

Rule used: only numbers that a page literally stated are written as numbers. Anything I could not read is marked NOT READ, not estimated.

## What was read, with numbers

### 1. Waller & Eriksson (2016), "Vocal Age Disguise: The Role of Fundamental Frequency and Speech Rate and Its Perceived Effects", Frontiers in Psychology 7:1814
https://pmc.ncbi.nlm.nih.gov/articles/PMC5116570/ (read in full through Study 2)
- 36 speakers (12 each aged 20-25, 40-45, 60-65) disguised their own voices to sound about 20 years older or younger. 60 listeners (mean age 26.1) estimated ages.
- Pooled means, natural / sounding-older: fundamental frequency (F0) **156.40 Hz / 145.20 Hz**; speech rate **3.82 / 3.12 syllables per second**.
- Perceived age: **47.25 natural, 50.74 sounding-older, 44.90 sounding-younger** (F(2,94)=31.29, p<.01).
- Authors' conclusion: listeners used **speech rate, but not F0**, as a cue to age. The achieved effect was only about 3 years against an intended 20.
- My arithmetic from those means (not stated by the paper): older-disguise F0 is -7.2% (about -1.3 semitones); speech rate is -18.3% (speed factor about 0.82); perceived age +3.5 years.
- Caveat: young adults imitating old voices, not real old voices.

### 2. Waller, Eriksson & Sörqvist (2015), "Can you hear my age? Influences of speech rate and speech spontaneity on estimation of speaker age", Frontiers in Psychology 6:978
https://www.frontiersin.org/articles/10.3389/fpsyg.2015.00978/full (read)
- Speech rate was changed by **10% faster and 10% slower** with pitch held constant (20% made some voices sound strange). 81 listeners (read speech) and 86 (spontaneous speech).
- Speech rate was a significant cue to perceived age (read speech F(2,160)=70.69, p<.001; spontaneous F(2,170)=22.65, p<.001). The effect was larger for the older speakers.
- Years of perceived-age change per manipulation: NOT STATED in the text (statistics and figures only).
- F0 was measured but not manipulated or tested.

### 3. Rojas, Kefalianos & Vogel (2020), "How does our voice change as we age? A systematic review and meta-analysis...", J Speech Lang Hear Res 63(2):533-551, DOI 10.1044/2019_JSLHR-19-00099
Abstract only, via https://researchers.uss.cl/en/publications/how-does-our-voice-change-as-we-age-a-systematic-review-and-meta--2/ (publisher page blocked, full text NOT READ)
- 47 studies; meta-analysis of 16 acoustic parameters from 1,475 healthy adults over 50.
- Adults aged 80-89 had significantly **higher F0, jitter percent and shimmer percent** than adults aged 60-69, and higher jitter and shimmer than 70-79.
- Males had significantly higher perturbation scores (noise-to-harmonic ratio, absolute jitter) than females.
- Sizes (Hz, %, dB): NOT READ.

### 4. Search-result summaries only (not read in full; treat as leads, not citations of numbers)
- Spazzapan et al. (2019), Revista CEFAC, integrative review of 19 studies: F0 falls gradually in women from childhood to old age; in men the decrease lasts until adulthood. https://www.scielo.br/j/rcefac/a/s8ZVDwWcsMpcW4VhkYtC7bx/
- Taylor et al. (2020), 169 people aged 17-87: sex-dependent F0 change; summary says men show a slight F0 rise with age, women a fall.
- Tuomainen & Hazan (2016, Interspeech) and a JSLHR 2014 paper (10.1044/2014_JSLHR-S-12-0261): older adults speak with a lower articulation rate in conversation. Both returned HTTP 403, so syllables-per-second values are NOT READ. Jeffrey can open https://discovery-pp.ucl.ac.uk/1519597/1/Tuomainen%20Hazan%20interspeech%202016.pdf in a browser.
- Tremor: I found no study giving tremor sizes for older voices. It is the weakest part of the evidence.

## How our filter compares (voice/aging.js, full aging at apparent age 70)

| Our setting | Research | Reading |
|---|---|---|
| Speed 0.96 (4% slower) | Older-sounding disguise was 18% slower; a 10% change measurably shifts perceived age; speech rate is the cue that worked | We are well below what the evidence says listeners respond to |
| Pitch -0.6 semitones (men), -0.8 (women) | Older-sounding disguise was -7.2% (about -1.3 st), but F0 was not the cue listeners used; real men may not drop (CEFAC/Taylor summaries, unread in full); real women drop; meta-analysis finds F0 higher at 80-89 | Pitch is the weakest lever and the riskiest for "still sounds like me", especially for men |
| Vibrato 0.008, tremor 0.04 | Jitter/shimmer rise with age (meta-analysis, sizes NOT READ); tremor sizes not found | Direction supported, amounts are by ear, cannot be cited |
| Tone cut 0.14 | Not covered by anything I read | By ear, cannot be cited |

## Proposals (not applied; Jeffrey decides)
1. **Move the slowdown toward 10% (speed about 0.90) and cut the pitch drop.** The best-supported cue is speech rate, while a lowered pitch is what makes the clone sound like someone else. This trades pitch for pace and should keep "sounds like me" better than the current table, but it has not been listened to.
2. **Men: pitch shift about 0** (research is mixed and the plan itself says men's pitch can rise slightly). **Women: keep a small drop.**
3. Keep vibrato and tremor small and describe them honestly as "by ear, direction supported by higher jitter and shimmer in 80-89 year olds".
4. For the Devpost voice page, the honest claim is: "the aged voice's pace change is in the range the research shows listeners respond to", only after proposal 1 is made and a listener test (9 of 10 pick the aged clip as older, plan Part 4) is run.
5. Open the two blocked papers in a browser to get syllables per second and the meta-analysis effect sizes; I could not.
