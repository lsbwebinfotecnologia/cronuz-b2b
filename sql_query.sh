#!/bin/bash
sudo -u postgres psql -d cronuz_b2b -c "SELECT id, corporate_name, document, email FROM crm_customer WHERE email='livraria@exemplo.com' OR name LIKE '%LIVRARIA%';"
