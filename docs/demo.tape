# VHS tape for the README demo GIF. Regenerate with:
#   brew install vhs
#   vhs docs/demo.tape
# Renders docs/demo.gif from scripts/demo.sh's real, unmocked output.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 1440
Set Height 780
Set Padding 20
Set Theme "Dracula"
Set TypingSpeed 60ms
Set WaitTimeout 5s

Hide
Type "clear"
Enter
Show

Type "bash scripts/demo.sh"
Enter
# Script runtime is ~17s; buffer so the final "Done." line is visible.
Sleep 20s
