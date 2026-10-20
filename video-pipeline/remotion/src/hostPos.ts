import type {Scene} from './types';
import type {AvatarPos} from './avatar/AvatarLayer';

/** Where the character stands if the script does not say. */
export const defaultPos = (type: Scene['type'], toon: boolean): AvatarPos => {
  switch (type) {
    case 'avatar':
      return 'side-left';
    case 'clip':
    case 'still':
    case 'image':
      return toon ? 'side-left' : 'corner-right';
    case 'poster':
    case 'score':
    case 'compare':
    case 'quote':
    case 'list':
    case 'stat':
      return toon ? 'side-right' : 'corner-right';
    case 'title':
    case 'outro':
      return 'side-right';
    default:
      return 'none';
  }
};

/** Where the host stands for a scene; with `host: none` in the script there is no host anywhere. */
export const hostPosFor = (scene: Scene, toon: boolean, host?: string): AvatarPos => (host === 'none' ? 'none' : scene.props.pos ?? defaultPos(scene.type, toon));
