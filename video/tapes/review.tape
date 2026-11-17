# Shot 7: /review finds the bug the unit test can't see; you ask for the fix, and it's proven.
Output public/clips/review.mp4
Source tapes/common/settings.tape
Set TypingSpeed 60ms

Hide
Type "node scenes/run.mjs review"
Enter
Sleep 4s
Show

Sleep 1s
# cue: prompt
Type "/review"
Sleep 700ms
Enter
Sleep 1700ms
# cue: repro
Sleep 2800ms
# cue: finding
Sleep 4s
Type "Fix it"
Sleep 400ms
Enter
Sleep 3300ms
# cue: passed
Sleep 3500ms
