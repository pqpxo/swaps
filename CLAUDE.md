## Stream Timeout Prevention

1. Do each numbered task ONE AT A TIME. Complete one task fully,
   confirm it worked, then move to the next.
2. Never write a file longer than ~150 lines in a single tool call.
   If a file will be longer, write it in multiple append/edit passes.
3. Start a fresh session if the conversation gets long (20+ tool calls).
   The error gets worse as the session grows.
4. Keep individual grep/search outputs short. Use flags like
   `--include` and `-l` (list files only) to limit output size.
5. If you do hit the timeout, retry the same step in a shorter form.
   Don't repeat the entire task from scratch.
