# Shot 5: /until npm test sends the agent back when it claims done too early.
Output public/clips/build.mp4
Source tapes/common/settings.tape
Set TypingSpeed 45ms

Hide
Type "node scenes/run.mjs build"
Enter
Sleep 4s
Show

Sleep 1s
# cue: prompt
Type "/until npm test -- implement .pi/PLAN.md"
Sleep 400ms
Enter
Sleep 300ms
# cue: kickoff
Sleep 3200ms
# cue: red
Sleep 3500ms
# cue: green
Sleep 4500ms
