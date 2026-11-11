import { asp } from './sources/asp';
import { buccheri } from './sources/buccheri';
import { civico } from './sources/civico';
import { policlinico } from './sources/policlinico';
import { riuniti } from './sources/riuniti';
import type { Fonte } from './types';

export const FONTI: Fonte[] = [riuniti, civico, policlinico, asp, buccheri];
