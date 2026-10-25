# Open-Meteo Forecast Solar

Cette intégration estime ce que vos panneaux solaires vont produire, aujourd'hui et demain, à
partir des prévisions météo gratuites d'[Open-Meteo](https://open-meteo.com). Pas de compte,
pas de clé d'API : elle fonctionne dès l'installation.

C'est une intégration **cloud** : Gladys doit pouvoir joindre `api.open-meteo.com` par
internet. Elle demande Gladys 5.3.0 ou plus récent.

## Avant de commencer

La prévision est faite pour la **position de votre maison dans Gladys** (**Paramètres →
Maisons**). À l'installation, Gladys vous demande d'autoriser l'intégration à la lire. Si vos
panneaux sont ailleurs, vous saisirez leurs coordonnées dans la configuration. Avec plusieurs
maisons, choisissez celle qui porte les panneaux dans le champ **Maison** ; laissé vide, c'est
la première maison placée sur la carte qui est utilisée.

Ayez sous la main la description de vos panneaux :

- leur **puissance crête** : la somme des puissances inscrites sur leurs étiquettes
  (10 panneaux de 400 W = 4 kWc) ;
- leur **inclinaison** : 0° à plat, 90° vertical, souvent 30° à 45° sur un toit en pente ;
- leur **orientation** : la direction vers laquelle ils sont tournés, comme sur une boussole
  (180° = sud).

## Configuration

Ouvrez **Intégrations → Open-Meteo Forecast Solar → Configuration** :

| Champ                   | Quoi saisir                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Puissance crête (kWc)   | Puissance crête totale des panneaux, en kilowatts.                                                                      |
| Inclinaison (°)         | 0 = à plat, 90 = vertical. 30 par défaut.                                                                               |
| Orientation (°)         | 0 = nord, 90 = est, 180 = sud, 270 = ouest. 180 par défaut.                                                             |
| Pertes du système (%)   | Onduleur, câbles, salissures, vieillissement. 14 par défaut. Baissez-la si les estimations sont trop basses.            |
| Seuil de production (W) | La puissance utilisée par le déclencheur « La production estimée franchit le seuil ». 1000 W par défaut.                |
| Rafraîchissement (min)  | Minutes entre deux appels à Open-Meteo, 15 minimum. 30 par défaut.                                                      |
| Maison                  | La maison Gladys où se trouvent les panneaux. Vide : la première maison placée sur la carte.                            |
| Latitude / Longitude    | Seulement pour des panneaux loin de la maison. Laissez les deux vides pour utiliser la position de votre maison Gladys. |

Enregistrez, puis cliquez sur **Tester la prévision** : la réponse donne la production estimée
d'aujourd'hui et de demain, et le pic de la journée. Ouvrez ensuite l'onglet **Découverte** et
ajoutez l'appareil **Solar forecast**.

## L'appareil

| Fonctionnalité                        | Signification                                                |
| ------------------------------------- | ------------------------------------------------------------ |
| Estimated power now (W)               | Ce que les panneaux devraient produire en ce moment.         |
| Estimated power next hour (W)         | La puissance moyenne attendue sur les 60 prochaines minutes. |
| Estimated peak power today (W)        | La puissance la plus haute de la journée.                    |
| Estimated production today (kWh)      | Toute la journée, de minuit à minuit.                        |
| Estimated production left today (kWh) | Ce qui reste à venir aujourd'hui.                            |
| Estimated production tomorrow (kWh)   | Toute la journée de demain.                                  |

Vous pouvez renommer l'appareil et ses fonctionnalités en l'ajoutant. La puissance est
recalculée chaque minute ; Open-Meteo est rappelé à l'intervalle de rafraîchissement de la
configuration. Ce sont des **prévisions** : le suivi d'énergie de Gladys ne les compte jamais
comme une production réelle.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes, dans la catégorie
**Intégrations**.

### Déclencheurs

- **La production estimée franchit le seuil** — lance la scène quand la puissance estimée passe
  au-dessus du seuil de la configuration, ou repasse en dessous. Choisissez **Passe au-dessus**
  ou **Passe en dessous** (ou laissez vide pour les deux). La scène peut lire
  `{{triggerEvent.data.power}}` (puissance estimée, W), `{{triggerEvent.data.threshold}}` et
  `{{triggerEvent.data.direction}}` (`above` ou `below`).
- **Prévision solaire mise à jour** — lance la scène à chaque nouvelle prévision (à
  l'intervalle de rafraîchissement). Variables : `energy_today`, `energy_remaining_today`,
  `energy_tomorrow` (kWh), `peak_power_today` (W) et `peak_time_today` (`HH:MM`).

### Actions

- **Obtenir la prévision solaire** — donne les chiffres actuels aux actions suivantes :
  puissance maintenant, heure suivante et pic (W), production aujourd'hui, restante et demain
  (kWh), heure du pic. Activez **Appeler Open-Meteo d'abord** pour une prévision toute fraîche.
  `available` vaut faux tant qu'il n'y a pas de prévision.
- **Trouver le créneau le plus ensoleillé** — trouve le créneau d'une durée donnée (arrondie au
  quart d'heure) où la production estimée est la plus forte, **aujourd'hui** (à partir de
  maintenant) ou **demain**. Sorties : `found`, `start` et `end` (`HH:MM`), `energy` (kWh) et
  `average_power` (W).

Exemple : chaque soir à 21 h, lancez **Trouver le créneau le plus ensoleillé** (3 heures,
demain), puis envoyez-vous le message « Lancer le lave-vaisselle demain entre {{0.0.start}} et
{{0.0.end}} ».

## Tableau de bord

Modifiez un tableau de bord et ajoutez le widget **Prévision solaire**. Il affiche la
puissance estimée maintenant et la production d'aujourd'hui et de demain (en direct), la courbe
de production des deux jours avec le pic, ce qui reste aujourd'hui, votre installation, sa
position et l'heure de la dernière mise à jour. Le bouton **Actualiser** appelle Open-Meteo
tout de suite.

## En cas de problème

- **« Aucune position »** : renseignez la position de votre maison dans **Paramètres →
  Maisons**, ou saisissez une latitude et une longitude dans la configuration. Quand la maison
  choisie dans le champ **Maison** a été supprimée ou n'est pas placée sur la carte, le message
  le dit : choisissez une autre maison ou placez-la sur la carte.
- **« Open-Meteo n'a pas pu être joint »** : Gladys n'a pas accès à internet, ou Open-Meteo est
  en panne. La dernière prévision reste affichée (point orange sur le badge de l'appareil) et
  l'intégration réessaie toutes les 5 minutes.
- **Les estimations sont toujours trop hautes ou trop basses** : ajustez les **Pertes du
  système**. L'ombre et la neige ne sont pas prises en compte.
- Les logs de l'intégration sont dans **Paramètres → Intégrations → Open-Meteo Forecast Solar
  → Logs**.

## Crédits

Données météo par [Open-Meteo.com](https://open-meteo.com/), sous licence
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). L'API gratuite d'Open-Meteo est
réservée à un usage non commercial.
