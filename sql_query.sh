psql -U cronuz_admin -d cronuz_b2b -h localhost -t -c "
SELECT 'DEST=' || c.document || ' CLI=' || cu.document || ' GUID=' || COALESCE(cu.id_guid, cs.horus_default_b2b_guid, '')
FROM crm_customer cu
JOIN cmp_company c ON c.id = cu.company_id
LEFT JOIN cmp_settings cs ON cs.company_id = c.id
WHERE cu.id = 455;
"
