---
id: student-data-features
title: Student Data Features for Categorization
type: spec
status: proposed
since: 2026-08-27
lastReviewed: 2026-08-29
dependsOn:
  - architecture
  - dynamodb-schema
  - ml-pipeline
  - lgpd
requiredBy: []
---

# Student Data Features for Categorization

> Status: **future direction** — this spec catalogs structured data that can be used to categorize students in supervised ML models. It is **not in scope for the MVP**, which ships only the offline-trained VARK predictor plus heuristic indicators. The purpose here is to register the evidence base and the concrete feature catalog, so future trainings ("categorize students from general data such as academic history") can be designed without re-researching the literature.

## Purpose

When the system has collected enough structured student data, it should train models to categorize students (academic performance, at-risk/learning-difficulty signals, giftedness, learning styles, engagement profiles). This document answers: **which structured attributes are usable as features, where they come from, and which sources support them.**

All features below are structured (categorical/numerical/ordinal), suitable for tabular ML pipelines (scikit-learn, XGBoost) — no unstructured text/video/biometric input is assumed.

---

## Grounding in the primary dataset

The primary training source for the MVP model is the **Armand, Eboue (2021)** dataset (DOI: 10.17632/bwrr6zypcj.1, see [ML Pipeline — Datasets](./ml-pipeline.md#datasets)). Its observed schema anchors two catalog entries above:

- **Demographic** → `Gender` (Male/Female), `Age` (integer) — columns [1–2].
- **Learning style / VARK** → 15 Likert items rated 1–5, grouped into three 5-item subscales (**reading/writing, aural, kinesthetic**), plus a single-modality `Learner` label (`A`/`K`/…). Item wording, e.g.: *"I learn better by reading than by listening to someone"* (reading/writing), *"I remember things I have heard in class better than things I have read"* (aural), *"I enjoy learning in class by doing experiments"* (kinesthetic).

So the feature vector for the MVP VARK model is precisely: the 15 item responses + `Gender` + `Age` → `Learner`. Every other category in this catalog is **future** data the system must first collect (anamnesis, behavior checklist, socioemotional form, observations). The kids' form in the system reuses the same per-modality scoring over adapted items so future mixed training (public + exported) stays aligned.

## Feature categories (evidence-based)

Systematic reviews in Educational Data Mining (EDM) consistently group predictive features into three to four categories:

| Category | Evidence |
|----------|----------|
| Academic performance | Most frequently used; CGPA appears in >82% of reviewed studies [R3] |
| Engagement / behavioral | Online learning activities and term assessments are the strongest predictors of outcomes [R1] |
| Demographic | Used in ~45% of studies [R3]; strongest when combined with academic features [R2] |
| Family / socio-economic | Parent education, family status, income level [R2][R4] |

Balaji et al. [R2] found that models using only behavioral features achieve minimal accuracy; the best results come from combining demographic + academic (+ behavioral). Demographic data alone is weaker than behavioral/engagement data in several at-risk studies [R7][R8]. Recommendation: **collect all categories; models decide importance.**

---

## Feature catalog

### 1. Demographic

| Feature | Type | Source in this system | Refs |
|---------|------|----------------------|------|
| Age / birth date | integer/date | Student profile (`STUDENT#`) | [R2][R8][R9] |
| Sex / gender | categorical | Student profile | [R1][R2][R8] |
| Year/grade level | ordinal | Student profile | [R2][R4] |
| School / institution | categorical | Student profile | [R4] |
| Mode of study | categorical | anamnesis form | [R2] |
| Disability indicator | boolean | anamnesis form | [R2] |
| Commuting (travel time) | categorical | anamnesis form | [R2] |
| Number of siblings | integer | anamnesis form | [R2][R4] |

### 2. Family & socio-economic

| Feature | Type | Source in this system | Refs |
|---------|------|----------------------|------|
| Guardian's education level | ordinal | anamnesis form | [R2][R4][R8] |
| Guardian's employment type | categorical | anamnesis form | [R2] |
| Family income level | ordinal | anamnesis form | [R2][R4] |
| Family structure (two-parent/single/etc.) | categorical | anamnesis form | [R2][R4] |
| Social support network | categorical | anamnesis form | [R2] |
| Tuition funding source | categorical | anamnesis form | [R2] |
| Home support for learning | ordinal | anamnesis form | [R4] |

### 3. Academic performance

| Feature | Type | Source in this system | Refs |
|---------|------|----------------------|------|
| Grades per subject (current/previous) | numeric/ordinal | observations, reports | [R1][R2][R3] |
| Overall average / CGPA | numeric | observations, reports | [R3] |
| Grades trend over time | numeric (delta) | observations | [R1][R6] |
| Assignment/quiz/test scores | numeric | observations | [R1][R6][R7] |
| Number of assessment attempts | integer | observations | [R2][R6] |
| Entrance / baseline assessment | numeric | anamnesis form, reports | [R2] |
| Course credits/hours | numeric | anamnesis form | [R3] |

### 4. Engagement & behavioral

| Feature | Type | Source in this system | Refs |
|---------|------|----------------------|------|
| Attendance (days absent / rate) | integer/ratio | behavior-checklist, observations | [R2][R8] |
| Study time / time on task | numeric | observations | [R2][R4] |
| Assignment submission count | integer | observations | [R2][R7] |
| Participation in activities (hand-raises, discussions, forums) | integer | behavior-checklist, observations | [R2][R8] |
| Resource/material access count | integer | observations | [R2][R8] |
| Interaction with class material | integer | observations | [R1][R2] |
| Response/completion time | numeric | observations | [R2] |
| Frequency/regularity of study | ordinal | observations | [R7] |
| Classroom behavior indicators | ordinal | behavior-checklist | [R2] |

### 5. Psychological & socioemotional

| Feature | Type | Source in this system | Refs |
|---------|------|----------------------|------|
| Intrinsic motivation | Likert scale | socioemotional form | [R1][R9] |
| Self-efficacy | Likert scale | socioemotional form | [R9] |
| Interest / enthusiasm | Likert scale | socioemotional form | [R1] |
| Academic emotions / engagement | Likert scale | socioemotional form | [R1] |
| Openness to experience | Likert scale | socioemotional form | [R9] |
| Problem-solving strategy quality | ordinal | socioemotional form, observations | [R9] |
| Self-regulation / focus | Likert scale | socioemotional form | [R2] |

### 6. Assessment & psychometric (giftedness-specific)

These are validated instruments. The system should store **scores/ratings** as structured attributes, not attempt to re-invent the instruments.

| Instrument / signal | What it measures | Notes | Refs |
|---------------------|------------------|-------|------|
| Teacher rating scales (e.g., HOPE, SRBCSS) | Academic + socioemotional giftedness indicators | ML on HOPE data identified gifted students with high accuracy; watch teacher bias | [R10] |
| Teacher nomination | Multi-domain giftedness nomination | 69-item scales can be reduced to ~20 high-information items | [R11] |
| Family/parent nomination | Developmental history signals | Reduces false negatives; best combined with other tools | [R12] |
| WISC-V (Wechsler Intelligence Scale for Children) | Verbal comprehension, perceptual reasoning, working memory, processing speed | Most-used test in giftedness research; Perceptual Reasoning strongest predictor | [R12][R13] |
| Raven's Progressive Matrices | Fluid/abstract reasoning | Less culturally biased; RSPM commonly used for elementary students | [R12][R13] |
| CogAT (Cognitive Abilities Test) | Verbal/quantitative/nonverbal reasoning | Validated for gifted identification; alone underrepresents gifted students | [R12] |
| School grades | Achieved academic performance | Strong feature; gifted students show higher grades | [R9][R13] |
| Peer nomination | Social signals | Used with grades + readiness assessment in ANN models | [R13] |
| School-readiness assessment | Early developmental baseline | Part of strong predictive models for giftedness | [R13] |

### 7. Institutional

| Feature | Type | Source in this system | Refs |
|---------|------|----------------------|------|
| Educator/class assignment | categorical | guardianship/follow edges | [R4] |
| Program/course type | categorical | Student profile | [R2][R4] |
| Teaching environment (classroom/online/blended) | categorical | Student profile | [R1][R3] |
| Institution/school | categorical | Student profile | [R4] |

---

## Candidate target variables (labels)

| Target | Formulation | Feasibility | Refs |
|--------|-------------|-------------|------|
| Academic performance level | classification (pass/fail or grade band) / regression | High — needs grades history | [R1][R3] |
| At-risk / learning difficulty | binary (needs support vs not) | High — engagement + performance | [R6][R7][R8] |
| Giftedness indicator | binary or multi-domain | Medium — needs validated ratings; bias risk | [R10][R12][R13] |
| Learning style / profile (VARK + others) | multi-label | High — MVP ships it; primary dataset provides the baseline feature set (15 Likert items + Gender + Age → `Learner`) | [ml-pipeline](./ml-pipeline.md) |
| Engagement profile (clustering) | unsupervised | High — OULAD-style behavior logs | [R5][R6] |

---

## Mapping to this system

Current collection points already cover most categories:

- **Student profile (`STUDENT#`)** → demographic, institutional.
- **`anamnesis` form (guardian)** → family/socio-economic, academic history, development/readiness.
- **`behavior-checklist` + observations (educator)** → engagement/behavioral, academic performance (activity, attendance, submissions, scores).
- **`socioemotional` form (educator)** → psychological/socioemotional (motivation, self-efficacy, emotions).
- **Reports** → aggregated grades when school data is attached.
- **`vark` form** → learning-style features (MVP).

The nightly export (`feature-export` Lambda → S3 snapshot) is the plumbing: any future model consumes the snapshot contract without system changes ([ml-pipeline.md](./ml-pipeline.md)).

---

## Data quality & bias considerations

- **Teacher-rating bias:** ML on the HOPE scale showed significant teacher-score variation across socio-economic/ethnic groups — ratings can encode implicit bias [R10]. The same caution applies to nominations [R12].
- **Demographic data ≠ destiny:** the literature stresses demographics alone are weak predictors and can be harmful if over-weighted [R2][R6]; combine with academic + behavioral data.
- **Single indicator insufficiency:** no single test score reliably identifies giftedness (WISC-V/CogAT/Raven alone underrepresent groups) [R12][R13]. Multi-source, multi-domain assessment reduces false negatives and supports twice-exceptional students.
- **LGPD:** features are sensitive (minors, family income, disability, motivation). Collection requires the versioned guardian consent; features exported to the `-data` bucket must be **anonymized/pseudonymized and minimized** (no direct identifiers) — see [lgpd.md](./lgpd.md).
- **Label honesty:** giftedness/at-risk labels from models are **suggestions for the educator**, never formal diagnoses — mirroring the MVP's heuristic-indicator philosophy ([architecture.md](./architecture.md)).

---

## Sources

**Reviews & surveys**
- [R1] Alshanqiti, A. (2021). *Predicting Student Performance Using Data Mining and Learning Analytics Techniques: A Systematic Literature Review.* Applied Sciences, 11(1), 237. https://doi.org/10.3390/app11010237
- [R2] Balaji, P., Alelyani, S., Qahmash, A., & Mohana, M. (2021). *Contributions of Machine Learning Models towards Student Academic Performance Prediction: A Systematic Review.* Applied Sciences, 11(21), 10007. https://doi.org/10.3390/app112110007
- [R3] *Students' Academic Performance Prediction Using Educational Data Mining and Machine Learning: A Systematic Review.* (2024). International Journal of Research and Innovation in Social Science, 8(8). https://rsisinternational.org/journals/ijriss/articles/students-academic-performance-prediction-using-educational-data-mining-and-machine-learning-a-systematic-review/
- [R4] Yağcı, M. (2021). *Educational Data Mining Techniques for Student Performance Prediction: Method Review and Comparison Analysis.* Frontiers in Psychology, 12, 698490. https://doi.org/10.3389/fpsyg.2021.698490
- [R5] *Improve Student Risk Prediction with Clustering Techniques: A Systematic Review in Education Data Mining.* (2025). Education Sciences, 15(12), 1695. https://doi.org/10.3390/educsci15121695
- [R6] Ivashchenko, O., Lelovský, M., Kopp, A., Shmatko, O., & Cibák, L. (2026). *AI-driven Student Profiling: A Cross-Industry Review and Future Research Directions on Machine Learning for Admissions and Retention.* Entrepreneurship and Sustainability Issues, 13(4), 461–478.

**At-risk / retention**
- [R7] *Identifying At-Risk Students for Early Intervention — A Probabilistic Machine Learning Approach.* (2023). Applied Sciences, 13(6), 3869. https://doi.org/10.3390/app13063869
- [R8] Zaher, M. A. (2025). *Behavioral Learning Analytics for Academic Risk Stratification in Smart Learning Platforms: A Reproducible Study Using the Public xAPI-Edu-Data Dataset.* Journal of Adaptive Learning Ecosystems and Educational Futures.
- [R9] Dai, W., Lin, J., Jin, F. J.-Y., Tsai, Y.-S., Srivastava, N., Le Bodic, P., Gašević, D., & Chen, G. (2025). *Learning Analytics for Early Identification of At-Risk Students and Feedback Intervention.* Journal of Learning Analytics, 12(1). https://files.eric.ed.gov/fulltext/EJ1492730.pdf
- [R10] *Predicting At-Risk Students Using Clickstream Data in the Virtual Learning Environment.* (2019). Sustainability, 11(24), 7238. https://doi.org/10.3390/su11247238
- [R11] *Using Machine Learning to Predict Student Retention from Socio-Demographic Characteristics and App-Based Engagement Behaviours.* (2023). Scientific Reports, 13, 5765. https://doi.org/10.1038/s41598-023-32484-w
- [R12] Kuzilek, J., Zdrahal, Z., & Fuglik, D. (2017). *Analyzing Learner Behaviour Patterns, Performance and Engagement in the Open University Learning Analytics Dataset.* International Journal of Information and Learning Technology, 34(3), 239–250.

**Giftedness**
- [R13] *Enhancing Gifted Identification: A Machine Learning Analysis of the HOPE Teacher Rating Scale Responses.* (2025). Gifted Child Quarterly. https://doi.org/10.1177/1932202X251362945
- [R14] *Asking the Right Questions to Nominate a Student as Gifted and Talented: A Machine Learning Approach.* (2020). Journal of Information Technologies, 13(4).
- [R15] *The Identification of Giftedness in Children: A Systematic Review.* (2025). Education Sciences, 15(8), 1012. https://doi.org/10.3390/educsci15081012
- [R16] Kuznetsova, E., et al. (2024). *Giftedness Identification and Cognitive, Physiological and Psychological Characteristics of Gifted Children: A Systematic Review.* Frontiers in Psychology, 15, 1411981. https://doi.org/10.3389/fpsyg.2024.1411981
- [R17] Pavlin-Bernardić, N., Rovan, D., & Pavlović, J. (2016). *The Application of Artificial Neural Networks in Predicting Children's Giftedness.* Suvremena psihologija, 19(2), 149–166.

**Datasets** (for public data with usable columns, see [ML Pipeline — Candidate datasets](./ml-pipeline.md#candidate-datasets), e.g., UCI Student Performance [R4 uses it], OULAD [R12], xAPI-Edu-Data [R8], Alzahrani & El-Sabagh VARK dataset).

---

## Dependencies

- **Depends on**: [architecture](./architecture.md) (forms engine, profiles, decoupling), [dynamodb-schema](./dynamodb-schema.md) (storage of the attribute sources above), [ml-pipeline](./ml-pipeline.md) (training, datasets, snapshot contract), [lgpd](./lgpd.md) (consent, minimization, anonymization of features).
- **Required by**: none — this is a `proposed` (future-direction) spec; `ml-pipeline.md` references it as evidence base.

## See Also

- [Architecture](./architecture.md) — forms engine, profiles, decoupling
- [ML Pipeline](./ml-pipeline.md) — training, datasets, extending with future models
- [DynamoDB Schema](./dynamodb-schema.md) — storage of the attributes above
- [LGPD](./lgpd.md) — consent, minimization, anonymization of features
