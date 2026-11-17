# Shot 6: "Done." with an unchecked edit. done-gate's reminder goes to the model, not the screen;
# the Remotion aside shows the captured text (public/clips/done-gate.hidden.json) at cue `done`.
Output public/clips/done-gate.mp4
Source tapes/common/settings.tape
Set TypingSpeed 45ms

Hide
Type "node scenes/run.mjs done-gate"
Enter
Sleep 4s
Show

Sleep 1s
# cue: prompt
Type "Add a runnable example for --shout"
Sleep 400ms
Enter
Sleep 1900ms
# cue: done
Sleep 5200ms
# cue: verified
Sleep 1300ms
# cue: summary
Sleep 4s
