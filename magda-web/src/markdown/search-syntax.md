---
title: Search Syntax
---
The first part is free text. This is followed by the filters – if you put these before the free text, it’ll assume that it’s part of the filter query.

The filters are:
‘by’: publisher
‘as’: format
‘from’: datasets with any part of their timespan after this date/time
‘to’: datasets with any part of their timespan before this date/time

The query for ‘by’ or ‘as’ can be anything including spaces as long as it doesn’t include another filter word. Unfortunately this means that you can’t say, filter by a format with the word ‘by’ in it, I’ll have to think about that.

The query for ‘from’ or ‘to’ can be a date or time or both – it uses the same permissive parser as we use to get dates from metadata. So ‘from 2005’ is fine and so is ‘from 2005-02-01T12:43:00Z’.

You can also use double-quotes (“”) to escape the filter parsing. So if I wanted to search for the exact phrase ‘From Earth to the Stars’ I could put it quotes (“From Earth to the Stars”) and the parser wouldn’t try to look for a date of ‘earth’ or ‘to the stars’, it’d just search for that phrase.

The filter words can appear in any order as long as they appear after the free text portion of the query. It’s also fine to not have any free text. E.g. just ‘by City of Melbourne’ is perfectly valid, and will find everything from the publisher City of Melbourne in no particular order.

You can also do an OR filter for publisher or format by repeating it – so ‘as KMZ as KML as SHP’ is perfectly valid.

The publisher filter doesn’t have to match an exact publisher… e.g. ‘by Council’ will filter by everything published by any publisher with the word ‘Council’ in it.

Examples:
‘water from 2001 to 2010’ searches for all datasets with a temporal span overlapping 2001-2010 that have the word ‘water’ in their metadata somewhere.
‘water as PDF as DOC by City of Melbourne’ searches for all datasets that either have a PDF or DOC file in them and are by City of Melbourne.
‘water by City of Melbourne as PDF as DOC’ does exactly the same thing
‘ ”water by City of Melbourne as PDF as DOC” ’ searches for the exact phrase ‘water as City of Melbourne as PDF as DOC’ with no filtering at all
‘as PDF by City of Melbourne’ searches for all datasets from the City of Melbourne publisher that have a PDF
