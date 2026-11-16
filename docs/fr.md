# Grid Frequency

La fréquence des réseaux électriques européens en temps réel : Europe
continentale, zone nordique et Grande-Bretagne. Tous les réseaux d'Europe
tournent à 50 Hz ; la fréquence baisse un peu quand la consommation dépasse la
production, et monte dans le cas inverse. C'est le pouls du réseau, la même
valeur dans toutes les prises d'une zone synchrone. Elle est lue sur des
sources ouvertes, sans compte ni clé : netzfrequenzmessung.de et
netzfrequenz.info (Europe continentale), Statnett (zone nordique) et Elexon
(Grande-Bretagne). Cette intégration est sans lien avec eux.

## Présentation

Pour chaque zone suivie, l'intégration ajoute un appareil avec :

- la **fréquence**, en Hz, au millième ;
- l'**écart à 50 Hz**, en mHz (−38 veut dire 49,962 Hz) ;
- l'**état du réseau** : 0 normal, 1 écart notable, 2 écart fort (voir « États
  du réseau » plus bas) ;
- l'**heure de la mesure** et la **source** qui l'a donnée.

En plus : un widget de tableau de bord avec la dernière heure, et deux
déclencheurs de scène, « Fréquence au-delà du seuil » et « Retour à la
normale ». Pour quoi faire : suivre le réseau par curiosité, l'expliquer à la
maison, ou reporter une grosse consommation quand le réseau manque de
production.

## Prérequis

- Gladys Assistant 5.2.0 ou plus récent.
- Un accès à Internet depuis Gladys. Ni compte, ni clé.

## Installation

Dans Gladys, **Intégrations → Installer depuis GitHub**, adresse
`https://github.com/guim31/gladys-grid-frequency`. Ouvrez ensuite l'onglet
**Configuration** de l'intégration, choisissez vos zones et enregistrez. Les
appareils apparaissent dans l'onglet **Découverte** : ajoutez-les.

## Configuration

- **Langue des noms** : langue des noms d'appareils et de fonctionnalités
  (figés à l'ajout d'un appareil) et des textes envoyés aux scènes. Français
  par défaut.
- **Europe continentale**, **Zone nordique**, **Grande-Bretagne** : un appareil
  par zone cochée. L'Europe continentale va du Portugal à la Pologne et à la
  Grèce, France et Allemagne comprises. La zone nordique, c'est la Norvège, la
  Suède, la Finlande et l'est du Danemark. L'ouest du Danemark fait partie de
  l'Europe continentale ; l'Irlande et les pays baltes ne sont pas couverts.
- **Intervalle de lecture** : 10, 15, 30 (par défaut) ou 60 secondes. Chaque
  lecture peut publier de nouveaux états, gardés dans l'historique de Gladys.
- **Seuil d'alerte** : l'écart à 50 Hz, en mHz, qui déclenche les scènes :
  ±50, ±100 (par défaut), ±150, ±200, ±300 ou ±500 mHz.

### Bouton Tester les sources

Lit toutes les sources de chaque zone, y compris celles de repli, et dit ce
que chacune a répondu. Le message est en rouge quand aucune source ne répond
pour une zone.

## Appareils

### Fréquence du réseau (un par zone)

| Fonctionnalité         | Valeurs                                      |
| ---------------------- | -------------------------------------------- |
| Fréquence (Hz)         | 47,5 à 52,5, trois décimales                 |
| Écart à 50 Hz (mHz)    | signé, de −500 à +500 sur une jauge          |
| État du réseau (0 à 2) | 0 normal, 1 écart notable, 2 écart fort      |
| Heure de la mesure     | « 16:19:00 », dans le fuseau de Gladys       |
| Source                 | netzfrequenzmessung.de, netzfrequenz.info, … |

Gladys n'a pas d'unité hertz : l'unité figure dans le nom de la
fonctionnalité. Les états ne sont publiés que lorsqu'ils changent, et au moins
toutes les six heures.

## États du réseau

Les seuils viennent des règles européennes d'exploitation des réseaux (SOGL,
règlement UE 2017/1485) et du code de réseau britannique :

| Zone                | Normal          | Écart notable | Écart fort         |
| ------------------- | --------------- | ------------- | ------------------ |
| Europe continentale | jusqu'à 50 mHz  | 50 à 200 mHz  | au-delà de 200 mHz |
| Zone nordique       | jusqu'à 100 mHz | 100 à 500 mHz | au-delà de 500 mHz |
| Grande-Bretagne     | jusqu'à 200 mHz | 200 à 500 mHz | au-delà de 500 mHz |

« Normal » correspond à la plage de fréquence standard de la zone. Au-delà, les
réserves sont à l'œuvre ; au-delà de « fort », la réserve primaire du continent
est entièrement mobilisée (ou, en Grande-Bretagne, la limite légale est
franchie). Repères sur le continent : entre ±10 et ±20 mHz, les réserves ne
réagissent même pas ; à 49,8 Hz, les gestionnaires déclenchent leurs plans
d'urgence ; à 49 Hz commence le délestage automatique. La Grande-Bretagne et la
zone nordique, réseaux plus petits, bougent davantage : ±100 mHz y est une
valeur de tous les jours.

## Widget

**Fréquence du réseau** : le nom de l'appareil de la zone, la fréquence et
l'écart (vert, orange ou rouge selon l'état du réseau), la fréquence de la
dernière heure tirée de l'historique de Gladys (une fois l'appareil ajouté),
l'état du réseau, la source et l'heure de la mesure. Réglages : la zone, et
deux interrupteurs pour masquer la courbe ou l'état et la source.

## Scènes

### Fréquence au-delà du seuil (déclencheur)

L'écart d'une zone dépasse le seuil d'alerte de la configuration. Une fois par
écart. Filtres : la zone, le sens (sous 50 Hz : déficit ; au-dessus de 50 Hz :
surplus). Variables : sens (`low`, `high`), fréquence (Hz), écart (mHz), seuil
(mHz), état du réseau en toutes lettres, zone.

### Retour à la normale (déclencheur)

Après un écart, l'écart redescend sous 80 % du seuil (la marge évite une rafale
d'événements quand la valeur oscille autour du seuil). Filtre : la zone.
Variables : fréquence, écart, écart maximal (mHz), durée de l'écart
(secondes), zone.

## Exemples de scènes

- « Fréquence au-delà du seuil », sens sous 50 Hz → couper le chauffe-eau ;
  « Retour à la normale » → le rallumer.
- « Fréquence au-delà du seuil » → envoyer un message avec la fréquence et
  l'écart, tirés des variables du déclencheur.
- Un déclencheur sur la valeur « État du réseau » égale à 2 → notification.

## Sources et conditions d'utilisation

| Zone                | Source                                          | Rythme                            |
| ------------------- | ----------------------------------------------- | --------------------------------- |
| Europe continentale | netzfrequenzmessung.de, interface à usage privé | une valeur toutes les 3 s         |
| Europe continentale | netzfrequenz.info, en repli                     | une valeur par seconde            |
| Zone nordique       | Statnett, données d'exploitation                | une valeur toutes les 10 s        |
| Grande-Bretagne     | Elexon BMRS, fréquence du système (FREQ)        | toutes les 15 s, ~2 min de retard |

La seconde source continentale n'est interrogée que si la première échoue,
répond une valeur invraisemblable ou vieille de plus d'une minute.
L'intégration interroge chaque source au plus une fois par intervalle (10 s au
minimum), bien en deçà du « une fois par seconde » que permet
netzfrequenzmessung.de. Son interface est destinée à un usage privé : une
installation domotique en est un. Les données d'Elexon sont publiées sous la
licence de données BMRS d'Elexon.

## Limites

- La valeur continentale est mesurée en Allemagne : c'est la même en France,
  en Espagne ou en Italie (un seul réseau synchrone), à quelques mHz près lors
  d'événements rapides.
- Une lecture toutes les 10 secondes au mieux : un creux d'une ou deux secondes
  peut passer inaperçu.
- La Grande-Bretagne a environ deux minutes de retard : pas de réaction rapide
  possible sur cette zone.
- Une seule source pour la zone nordique et la Grande-Bretagne : pas de repli.
- Les sources ouvertes ne garantissent aucun service.

## Dépannage

- **« Aucune source ne répond »** dans l'écran de configuration : utilisez le
  bouton « Tester les sources » ; le message nomme chaque source et son erreur.
  Une source en panne revient en général en quelques minutes.
- **Aucun état sur un appareil** : vérifiez qu'il est ajouté (onglet
  Découverte).
- **Trop d'événements** : relevez le seuil d'alerte ; ±100 mHz est rare sur le
  continent mais courant en Grande-Bretagne.
- Pour le détail : `LOG_LEVEL=debug` dans les journaux de l'intégration.

## Crédits

Données : [netzfrequenzmessung.de](https://www.netzfrequenzmessung.de),
[netzfrequenz.info](https://www.netzfrequenz.info),
[Statnett](https://driftsdata.statnett.no) et
[Elexon BMRS](https://bmrs.elexon.co.uk). Intégration par guim31, Apache-2.0.
