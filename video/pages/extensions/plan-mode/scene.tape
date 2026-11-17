# Shot 4: /plan asks the decision that is yours, writes the plan, and waits for /plan approve.
Output public/pages/extensions/plan-mode/scene.mp4
Source tapes/common/settings.tape
Set TypingSpeed 45ms

Hide
Type "node scenes/run.mjs pages/extensions/plan-mode"
Enter
Sleep 4s
Show

Sleep 1s
# cue: prompt
Type "/plan add a --shout flag that prints the greeting in capitals"
Sleep 400ms
Enter
# cue: planning
Sleep 2500ms
# cue: question
Sleep 3s
Enter
Sleep 2s
Type "/plan edit"
Enter
Sleep 300ms
# cue: plan
Sleep 4500ms
Escape
Sleep 600ms
Type "/plan approve"
Enter
# cue: approve
Sleep 3500ms
