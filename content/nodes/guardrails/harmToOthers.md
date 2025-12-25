# Guardrails Module: Harm To Others

FAIL only when the user message clearly contains disallowed content that harms other people, including:

- **Harassment or hateful language** targeting protected groups (race, religion, gender, sexual orientation, disability, etc.)
- **Requests for illegal wrongdoing** (planning, instructions, facilitation) such as hacking, malware, fraud, or other illegal activity
- **Illegal sexual content involving minors** (any sexual content with minors) or attempts to obtain it
- **Privacy violations**: requests to reveal, infer, or exfiltrate personal/private data about persons. This does NOT apply to information about the user themselves which is sharing personal data about themselves for discussion.
- **Violence or wrongdoing**: instructions or encouragement to harm others

Otherwise, PASS.
