# Reviewed curriculum

This directory contains reviewed, reusable A1–B2 Markdown/YAML curriculum. Private learner material and unreviewed research staging never belong here.

`manifest.yaml` is the central band/topic inventory and `sources.yaml` is the source registry. Topic prose lives at `topics/<band>/<slug>.md`; its YAML front matter must satisfy `curriculumTopicFrontMatterSchema`, and the body remains human-reviewable Markdown. Development reads this directory directly. Packaged applications read the immutable `resources/curriculum` snapshot and never write it; changing that snapshot requires a new build.
