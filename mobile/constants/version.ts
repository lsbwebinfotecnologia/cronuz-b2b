/**
 * version.ts
 * Controle central de versão do app mobile Horus B2B.
 *
 * Formato: MM.NNN
 *   MM  = versão major (mudanças estruturais)
 *   NNN = versão minor (features, fixes, ajustes)
 *
 * REGRA: sempre que uma alteração for commitada, incrementar BUILD.
 * O arquivo CHANGELOG.md em /docs/mobile/ documenta cada release.
 */

export const APP_VERSION = '01.021';

/** Data do último build (formato legível) */
export const APP_BUILD_DATE = '2026-06-22';

/** Descrição resumida da versão atual */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;

/** String completa para exibição no rodapé */
export const APP_VERSION_FOOTER = `Horus B2B ${APP_VERSION_LABEL} · ${APP_BUILD_DATE}`;
