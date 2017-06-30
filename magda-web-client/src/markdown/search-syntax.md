---
title: Search Syntax
---
Search for text in dataset and distribution metadata by simply typing it in the search box. Search results will include all of the terms you type. If you search for `water`, the results will also include `waters`, and vice-versa. To search for a word exactly, enclose it in quotes, e.g. `"water"`.

You can also use special filter keywords in the search box to do a more structured search. The keywords must be _after_ the free text. The filter keywords are:

* `by`: publisher, such as `Geoscience Australia`
* `as`: format, such as `CSV`
* `from`: datasets with any part of their timespan after this date/time, such as `2015-01-01`
* `to`: datasets with any part of their timespan before this date/time, such as `2017-06-01`

The query for `by` or `as` can be anything including spaces as long as it doesn’t include another filter word.

The query for `from` or `to` can be a date or time or both. It supports a wide variety of date and time formats. When in doubt, use an ISO8601 date and time, such as `2017-06-30T12:00:00Z`.

You can also use double-quotes (`""`) to escape the filter parsing. So if I wanted to search for the exact phrase `From Earth to the Stars` I could put it quotes (`"From Earth to the Stars"`) and the parser wouldn’t try to look for a date of ‘earth’ or ‘the stars’, it’d just search for that phrase.

The filter words can appear in any order as long as they appear after the free text portion of the query. It’s also fine to not have any free text. E.g. just ‘by City of Melbourne’ is perfectly valid, and will find everything from the publisher City of Melbourne in no particular order.

You can also do an OR filter for publisher or format by repeating it, e.g. `as KMZ as KML as SHP`.

The publisher filter doesn’t have to match an exact publisher. E.g. `by Council` will filter by everything published by any publisher with the word ‘Council’ in it.

Examples:
* `water from 2001 to 2010` searches for all datasets with a temporal span overlapping 2001-2010 that have the word ‘water’ in their metadata somewhere.
* `water as PDF as DOC by City of Melbourne` searches for all datasets that either have a PDF or DOC file in them and are by City of Melbourne.
* `water by City of Melbourne as PDF as DOC` does exactly the same thing
* `"water by City of Melbourne as PDF as DOC"` searches for the exact phrase ‘water as City of Melbourne as PDF as DOC’ with no filtering at all
* `as PDF by City of Melbourne` searches for all datasets from the City of Melbourne publisher that have a PDF
