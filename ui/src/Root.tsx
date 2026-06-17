import './fonts'; // triggers delayRender for font loading
import React from 'react';
import {Composition} from 'remotion';
import {MnemoxIntro} from './MnemoxIntro';
import {MnemoxFlowComposition} from './MnemoxFlowComposition';
import {FPS, TOTAL, W, H} from './tokens';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MnemoxIntro"
      component={MnemoxIntro}
      durationInFrames={TOTAL}
      fps={FPS}
      width={W}
      height={H}
    />
    <Composition
      id="MnemoxFlow"
      component={MnemoxFlowComposition}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
