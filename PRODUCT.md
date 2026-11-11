# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Esistente: HTML/CSS/JS statici in `web/` (Leaflet + MapLibre, nessun framework), serviti da un Cloudflare Worker (`src/`). Resta così.

## Users
Cittadini di Palermo, soprattutto da telefono (mobile-first), spesso di fretta o in ansia, che devono capire in pochi secondi quanto sono affollati i pronto soccorso della città. Su desktop: chi vuole di più (confronto tra presidi, lettura calma, dati completi, condivisione).

## Product Purpose
Mostra in tempo reale pazienti in attesa, sovraffollamento e codici colore dei PS di Palermo, letti dai dati pubblici degli ospedali. Successo: il cittadino capisce a colpo d'occhio la situazione e trova il presidio, senza scambiare il dato per una promessa di tempo di attesa.

## Positioning
Unica pagina civica che riunisce tutte le fonti dei PS di Palermo con mappa e dati onesti (valore mancante = `null`, mai inventato).

## Capabilities and Constraints
- Mappa con cerchi per presidio (anello = codici colore, bordo = affollamento), scheda per presidio, ricerca, filtri, ordinamento, «Vicino a me», tema chiaro/scuro, condividi.
- Dati vecchi mai presentati come freschi; disclaimer 112 sempre presente.
- Telefoni non compilati («Chiama» nascosto).

## Brand Commitments
Progetto civico di #opendatasicilia: logo e attribuzione restano. Colori dei codici triage fedeli al significato.

## Product Principles
1. Il dato che conta è il più grande e leggibile subito.
2. Onestà prima dell'effetto: mai numeri inventati, mai dato stantio mascherato.
3. Calma, non allarme: informare chi è già in ansia.
4. Mobile per primo, desktop più ricco.

## Accessibility & Inclusion
Leggibile per tutti, anche con ansia e fretta: contrasto alto, target tattili ampi, il colore non è mai l'unico segnale.

<!-- Assunzioni (non confermate): tono rassicurante; vincoli di marca oltre logo/codici triage. -->
