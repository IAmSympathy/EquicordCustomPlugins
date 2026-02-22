# Bot Role Color Plugin

Un plugin Equicord qui applique des couleurs personnalisées aux messages des bots, avec des effets de glow et des images de fond pour les embeds.

## Features

- 🎨 **Coloration des messages de bot** : Applique la couleur du rôle du bot aux messages
- ✨ **Effet Glow** : Ajoute un effet de lueur blanc au texte des messages de Netricsa
- 🖼️ **Image de fond** : Ajoute une image de fond avec très basse opacité aux embeds
- ⚙️ **Settings en temps réel** : Tous les changements s'appliquent instantanément
- 🚫 **Exclusions intelligentes** : Les mentions (@utilisateur, @rôle) et les liens ne sont pas affectés

## Configuration

### Image de fond

Le plugin charge automatiquement l'image de fond depuis le dossier `assets/background.png` (chemin relatif).

**Pour ajouter ton image:**

1. Place ton image dans le dossier `assets/` du plugin
2. Renomme-la en `background.png`
3. Redémarre Discord ou recharge le plugin

**Formats supportés:**
- PNG
- JPG/JPEG
- GIF
- SVG
- WebP

### Constantes disponibles

Dans le fichier `index.tsx`, tu peux modifier:

```typescript
// Opacité de l'image (0.15 = 15%)
const NETRICSA_EMBED_BG_OPACITY = 0.15;
```

### Settings disponibles

- **Color Intensity** : Contrôle l'intensité de la coloration (0-100%)
- **Enable Glow** : Active/désactive l'effet glow
- **Glow Intensity** : Contrôle l'intensité du glow (0-10)

## Bots supportés

- **Netricsa** (ID: 1462959115528835092) : Couleur #1f9ccd avec glow blanc
- **Autre bot** (ID: 1473424972046270608) : Couleur #56fd0d

## Fichiers du plugin

```
botRoleColor/
├── index.tsx              # Fichier principal du plugin
├── assets/                # Dossier pour les ressources
│   ├── background.png     # Image de fond (à ajouter)
│   └── PLACEHOLDER.txt    # Instructions
└── README.md             # Ce fichier
```

## Notes

- Les modifications des settings s'appliquent en temps réel
- L'image de fond ne s'applique que pour les embeds du bot Netricsa
- Le glow est blanc par défaut pour contraster avec les couleurs
- Les mentions et liens conservent leur style original
- Le chemin de l'image est relatif au dossier du plugin (portable)


