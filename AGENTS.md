## Sub-Agent Routing Policy
- **Sol (Main Thread)**: Handles architecture, high reasoning, system planning, and code reviews.
- **Luna Worker (Sub-Agent)**: Handles pure code generation and implementation tasks.
- **Execution Rule**: Sol must write a clean handoff block before spawning Luna. Luna must not reply to the user; it returns code directly to Sol.
