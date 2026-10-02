-- Migração: Adicionar campo character_name para codinomes de personagens em eventos
-- Tabela: sch_event_participant

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sch_event_participant' 
          AND column_name = 'character_name'
    ) THEN 
        ALTER TABLE sch_event_participant 
        ADD COLUMN character_name VARCHAR(100) NULL;

        CREATE INDEX IF NOT EXISTS idx_sch_part_character 
        ON sch_event_participant(event_id, character_name);

        COMMENT ON COLUMN sch_event_participant.character_name IS 'Codinome ou nome de personagem lúdico/engraçado atribuído ao participante no evento';
    END IF;
END $$;
