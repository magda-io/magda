SQLSyntax(
   value: (
      (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     (data#>>string_to_array(?, ','))::TEXT = ?::TEXT,
                     false
                  )
            )
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         exists (
            SELECT 1
            FROM recordaspects
            where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
         )
         and (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
      or (
         (
            not exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and (data#>string_to_array(?, ',')) IS NOT NULL
            )
         )
      )
      or (
         (
            exists (
               SELECT 1
               FROM recordaspects
               where (aspectid, recordid, tenantid) =(?, "records"."recordid", "records"."tenantid")
                  and COALESCE(
                     ?::TEXT = (data#>>string_to_array(?, ','))::TEXT,
                     false
                  )
            )
         )
      )
   ),
   parameters: List(
      dcat - dataset - strings,
      publishing,
      state,
      access - control,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      access - control,
,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      publishing,
      state,
      published,
      access - control,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      publishing,
      state,
      published,
      access - control,
,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      published,
      publishing,
      state,
      access - control,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      published,
      publishing,
      state,
      access - control,
,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      published,
      access - control,
      orgUnitId,
      dcat - dataset - strings,
      publishing,
      state,
      published,
      access - control,
,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      access - control,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      access - control,
,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      publishing,
      state,
      published,
      access - control,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      publishing,
      state,
      published,
      access - control,
,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      published,
      publishing,
      state,
      access - control,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      published,
      publishing,
      state,
      access - control,
,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      published,
      access - control,
      orgUnitId,
      dcat - distribution - strings,
      publishing,
      state,
      published,
      access - control,
,
      orgUnitId,
      organization - details,
      access - control,
      orgUnitId,
      organization - details,
      access - control,
,
      orgUnitId,
      access - control,
      orgUnitId,
      access - control,
,
      orgUnitId
   )
)