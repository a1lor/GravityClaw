#!/bin/bash
osascript << 'APPLESCRIPT' > /tmp/gc_calendar.json.tmp 2>/dev/null && mv /tmp/gc_calendar.json.tmp /tmp/gc_calendar.json || true
tell application "Calendar"
  set theJSON to "["
  set isFirst to true
  set theStart to current date
  set theEnd to theStart + (7 * days)
  repeat with aCal in calendars
    try
      set theEvents to (every event of aCal whose start date >= theStart and start date <= theEnd)
      repeat with anEvent in theEvents
        try
          if not isFirst then set theJSON to theJSON & ","
          set isFirst to false
          set sd to start date of anEvent
          set ed to end date of anEvent
          set sy to year of sd as integer
          set sm to month of sd as integer
          set sday to day of sd as integer
          set sh to hours of sd as integer
          set smin to minutes of sd as integer
          set ey to year of ed as integer
          set em to month of ed as integer
          set eday to day of ed as integer
          set eh to hours of ed as integer
          set emin to minutes of ed as integer
          
          set pad to {"00","01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59"}
          set startStr to (sy as string) & "-" & item (sm + 1) of pad & "-" & item (sday + 1) of pad & "T" & item (sh + 1) of pad & ":" & item (smin + 1) of pad
          set endStr to (ey as string) & "-" & item (em + 1) of pad & "-" & item (eday + 1) of pad & "T" & item (eh + 1) of pad & ":" & item (emin + 1) of pad
          
          set titleStr to summary of anEvent
          set calStr to name of aCal
          
          set theJSON to theJSON & "{\"title\":\"" & titleStr & "\",\"start\":\"" & startStr & "\",\"end\":\"" & endStr & "\",\"calendar\":\"" & calStr & "\"}"
        end try
      end repeat
    end try
  end repeat
  return theJSON & "]"
end tell
APPLESCRIPT
