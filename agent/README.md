# Control Agent Windows

Agent local pour Control Agent.

Installation :
1. Windows 10/11 avec Python 3.11+.
2. Ouvre un terminal dans ce dossier.
3. Lance : python -m pip install -r requirements.txt
4. Définis CONTROL_AGENT_TOKEN avec un token long et secret.
5. Lance : python agent.py

L'agent écoute par défaut sur le port 8765.

Test local :
ws://IP_DU_PC:8765

Le PC et la tablette doivent être sur le même réseau.

Attention : la version Vercel du site est en HTTPS. Un navigateur peut bloquer ws:// depuis une page HTTPS. Pour le premier test local, il faudra soit servir aussi l'interface en HTTP sur le réseau local, soit ajouter ensuite un relais/tunnel WSS sécurisé.

Sécurité :
- Change toujours le token par défaut.
- N'expose pas directement le port 8765 sur Internet.
- L'agent est conçu pour contrôler ton propre PC.
