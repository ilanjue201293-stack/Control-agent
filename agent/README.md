# Control Agent Windows

Agent Windows pour Control Agent.

## Ce que fait l'agent

- transmet l'écran du PC au navigateur
- contrôle souris/clavier
- texte Unicode via presse-papiers
- presse-papiers
- volume
- verrouillage
- captures d'écran
- authentification par token

## Installation

Windows 10/11 + Python 3.11+.

Le plus simple :

1. Double-clique sur **start-public.bat**.
2. Le script installe les dépendances Python.
3. Il démarre l'agent Windows.
4. Il télécharge automatiquement **cloudflared** si nécessaire.
5. Il crée un tunnel WSS public temporaire vers le PC.
6. Une URL `https://xxxxx.trycloudflare.com` apparaît dans la fenêtre.
7. Dans le site Control Agent, utilise la même adresse en `wss://xxxxx.trycloudflare.com`.
8. Utilise le token affiché par le script.

Le tunnel est temporaire et disparaît quand cloudflared est arrêté. Le port 8765 n'est pas exposé directement sur Internet.

## Important

Ne partage jamais ton token. Le token donne accès aux commandes de contrôle de ton PC.

Pour une version définitive, on pourra remplacer le Quick Tunnel par un relais/pairing permanent et supprimer complètement la saisie manuelle de l'URL.
