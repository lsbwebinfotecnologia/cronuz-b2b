import sqlite3

def patch_db():
    conn = sqlite3.connect('cronuz_b2b.db')
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS integrators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        platform VARCHAR(50) NOT NULL,
        credentials TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    conn.commit()
    conn.close()
    print("Banco de dados atualizado com a tabela integrators!")

if __name__ == "__main__":
    patch_db()
