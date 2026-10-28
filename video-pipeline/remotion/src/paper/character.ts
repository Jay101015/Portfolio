// Whether this video has the posing character on it (a Short with `poses`): the scenes then leave him room, and a
// scene drawing of somebody else is left out so the screen never shows two different people telling the story.
import React from 'react';
import {ART} from './art';

export const CharacterOn = React.createContext(false);

const PERSON = /\b(man|woman|men|women|person|people|someone|sam|maya|couple|friends|agent|landlord|salesman|parents|family|boss|clerk|he|she|his|her|young)\b/i;
export const isPersonArt = (name: string | undefined) => !!name && PERSON.test(ART[name]?.about ?? '');
