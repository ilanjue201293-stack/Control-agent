# Control Agent

Web app Next.js destinée à piloter un PC Windows depuis Safari/iPad.

## Déjà inclus

- Interface responsive tablette/mobile.
- Connexion WebSocket vers l’agent PC.
- Réception d’écran en JPEG, PNG ou WebP base64.
- Souris : mouvement, clic gauche, clic droit, molette.
- Clavier : touches rapides, raccourcis et envoi de texte.
- Commandes système : verrouillage, volume et capture.
- Mode démo pour vérifier l’interface sans agent.
- Endpoint de santé : /api/health.

## Déploiement Vercel

Variable optionnelle :

NEXT_PUBLIC_AGENT_WS_URL=wss://your-secure-agent-endpoint.example/ws

La page permet aussi de saisir l’URL depuis les réglages.

## Contrat WebSocket : navigateur vers agent

Chaque message est un objet JSON.

hello :
{"type":"hello","protocol":1,"token":"SECRET","client":{"name":"control-agent-web","version":"1.0.0","userAgent":"..."}}

screen_request :
{"type":"screen_request","quality":78,"maxFps":20}

pointer move :
{"type":"pointer","action":"move","x":0.42,"y":0.61}

pointer button :
{"type":"pointer","action":"button","x":0.42,"y":0.61,"button":"left","state":"down"}

wheel :
{"type":"wheel","dx":0,"dy":480}

key :
{"type":"key","action":"down","key":"c","code":"KeyC","modifiers":["ctrl"]}

type_text :
{"type":"type_text","text":"Bonjour"}

clipboard_get :
{"type":"clipboard_get"}

clipboard_set :
{"type":"clipboard_set","text":"Bonjour"}

system :
{"type":"system","action":"lock"}

Les coordonnées souris x et y sont normalisées entre 0 et 1 par rapport à l’écran.

## Contrat WebSocket : agent vers navigateur

hello :
{"type":"hello","protocol":1,"agent":{"name":"Control Agent","version":"1.0.0","os":"Windows","hostname":"PC"}}

screen_frame :
{"type":"screen_frame","mime":"image/jpeg","data":"BASE64...","width":1920,"height":1080,"timestamp":1730000000000}

agent_state :
{"type":"agent_state","connected":true,"locked":false,"width":1920,"height":1080}

clipboard :
{"type":"clipboard","text":"Bonjour"}

error :
{"type":"error","code":"AUTH_FAILED","message":"Token invalide"}

## Sécurité

Le token n’est pas stocké dans localStorage. Pour la production, utilise WSS, un token fort, une vérification d’origine côté agent et une limitation de débit.

## Développement

npm install
npm run dev

Puis ouvre http://localhost:3000.
