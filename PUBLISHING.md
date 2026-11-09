# Pubblicare pretty.md

Due registri: **VS Code Marketplace** (VS Code) e **Open VSX** (VSCodium, Cursor, Windsurf, Gitpod…).

## Una volta sola

1. **GitHub**: crea il repo vuoto `RemoGrillo/pretty_md` e fai push di questa cartella
   (il README del Marketplace prende le immagini da lì).
2. **Marketplace**: vai su https://marketplace.visualstudio.com/manage, entra con un account
   Microsoft, *Create publisher*. L'ID deve essere quello di `"publisher"` in `package.json`
   (ora `remogrillo`; se scegli un altro ID, cambia `package.json` e la riga
   `getExtension('remogrillo.pretty-md')` in `test/integration/index.ts`). L'ID non si cambia più.
3. **Open VSX** (facoltativo, per ora saltato: finché manca il secret `OVSX_PAT` la Action
   salta questo passo e allega il `.vsix` a una release GitHub, da cui si installa in VSCodium):
   entra su https://open-vsx.org con GitHub → crea un account Eclipse
   (https://accounts.eclipse.org/user/register, stesso username GitHub) → nel profilo
   Open VSX: *Log in with Eclipse* e firma il *Publisher Agreement* → genera un token in
   https://open-vsx.org/user-settings/tokens → crea il namespace:
   `npx ovsx create-namespace remogrillo -p <token>`

## Prima pubblicazione (a mano, senza token Microsoft)

- Marketplace: `npm run package` → nella pagina *manage* del publisher: *New extension →
  Visual Studio Code* → carica `pretty-md-<versione>.vsix`.
- Open VSX: `npx ovsx publish pretty-md-<versione>.vsix -p <token>`

## Rilasci successivi (automatici)

1. Marketplace → publisher → **Trusted Publishing** → nuova policy:
   owner `RemoGrillo`, repo `pretty_md`, workflow `publish.yml`, environment vuoto.
2. GitHub → repo → Settings → Secrets and variables → Actions → nuovo secret `OVSX_PAT`
   con il token Open VSX.
3. Per ogni rilascio: aggiorna `CHANGELOG.md`, poi
   `npm version patch` (o `minor`) e `git push --follow-tags`.
   Il tag `vX.Y.Z` avvia `.github/workflows/publish.yml`, che pubblica sul Marketplace, crea la
   release GitHub col `.vsix` e, se c'è il secret `OVSX_PAT`, pubblica anche su Open VSX.
4. VSCodium non vede il Marketplace: per aggiornare la tua copia,
   `npm run package && codium --install-extension pretty-md-<versione>.vsix --profile remo`.

I PAT "globali" di Azure DevOps (`vsce login`) vengono ritirati il 1° dicembre 2026:
non servono, il caricamento web + Trusted Publishing li sostituiscono.

## Prima di ogni rilascio

    npm run typecheck && npm test && npm run integration   # integration apre VSCodium per qualche secondo
    npm run samples   # out/samples/<tema>.html: controllo visivo dei temi nel browser
