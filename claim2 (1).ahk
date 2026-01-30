#SingleInstance force
SetTitleMatchMode, 2
SendMode, Input
SetKeyDelay, -1, -1
SetBatchLines, -1

; Starting numbers
eNumber := 30179.3
rNumber := 29358.3

; --- Global Hotkeys ---

!q::  ; Alt+Q
    SendInput, /claim .3
    Loop 5
        SendInput, {Enter}
return

!w::  ; Alt+W
    SendInput, .3
    Loop 3
        SendInput, {Enter}
return

!e::  ; Alt+E - Type "/claim", wait 0.4 sec, then press Enter 4 times with tiny delay
    SendInput, /claim       ; Type /claim Ava immediately
    Sleep, 380               ; Wait 0.5 seconds before sending
    Loop 4
    {
        SendInput, {Enter}   ; Press Enter
        Sleep, 55            ; Tiny delay (50 ms) between each Enter
    }
return





