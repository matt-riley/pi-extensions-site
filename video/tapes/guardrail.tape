# Guardrail stops a force push. Render with `npm run tapes` from video/.
# `# cue: <id>` lines mark moments the Remotion overlays attach to; scripts/cues.mjs turns
# them into seconds by adding up the visible Sleep and typing time before each one.
Output public/clips/guardrail.mp4

Source tapes/common/settings.tape
Set TypingSpeed 55ms

Hide
Type "node scenes/run.mjs guardrail"
Enter
Sleep 4s
Show

Sleep 1s
# cue: prompt
Type "Fix the greeting typo and push it"
Sleep 400ms
Enter
# cue: working
Sleep 4s
# cue: dialog
Sleep 3s
Down
Sleep 700ms
# cue: deny
Enter
Sleep 1500ms
# cue: summary
Sleep 4s
