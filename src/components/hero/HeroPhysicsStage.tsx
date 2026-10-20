import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { DuckExpression } from './SwimmingDuck';

export interface HeroPhysicsStageHandle {
  handleDuckDrop: (clientX: number, clientY: number, velocity: number) => void;
  handleDuckSwim: (duckX: number, duckY: number) => void;
  duckExpression: DuckExpression;
}

interface LetterData {
  id: string;
  char: string;
  wordIdx: number;
  letterIdx: number;
  posX: number;
  posY: number;
  wobble: number;
}

const INITIAL_LETTERS: Omit<LetterData, 'posX' | 'posY' | 'wobble'>[] = [
  { id: 'r1', char: 'R', wordIdx: 0, letterIdx: 0 },
  { id: 'e1', char: 'E', wordIdx: 0, letterIdx: 1 },
  { id: 'y1', char: 'Y', wordIdx: 0, letterIdx: 2 },
  { id: 'h1', char: 'H', wordIdx: 0, letterIdx: 3 },
  { id: 'a1', char: 'A', wordIdx: 0, letterIdx: 4 },
  { id: 'n1', char: 'N', wordIdx: 0, letterIdx: 5 },
  { id: 'd1', char: 'D', wordIdx: 0, letterIdx: 6 },
  { id: 'a2', char: 'A', wordIdx: 1, letterIdx: 0 },
  { id: 's1', char: 'S', wordIdx: 1, letterIdx: 1 },
  { id: 't1', char: 'T', wordIdx: 1, letterIdx: 2 },
  { id: 'r2', char: 'R', wordIdx: 1, letterIdx: 3 },
  { id: 'a3', char: 'A', wordIdx: 1, letterIdx: 4 },
];

interface HeroPhysicsStageProps {
  onSplash: (clientX: number, clientY: number, intensity: number) => void;
  onRipple: (clientX: number, clientY: number, size?: number) => void;
  onDuckExpressionChange?: (expression: DuckExpression) => void;
}

export const HeroPhysicsStage = forwardRef<HeroPhysicsStageHandle, HeroPhysicsStageProps>(
  ({ onSplash, onRipple, onDuckExpressionChange }, ref) => {
    const [letters, setLetters] = useState<LetterData[]>(() =>
      INITIAL_LETTERS.map((item) => ({
        ...item,
        posX: 0,
        posY: 0,
        wobble: 0
      }))
    );
    const [activeGrabbedId, setActiveGrabbedId] = useState<string | null>(null);
    const [duckExpression, setDuckExpression] = useState<DuckExpression>('normal');
    const duckImpactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRippleTimeRef = useRef<number>(0);
    const returnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastLetterHitTimeRef = useRef<Record<string, number>>({});

    const updateDuckExpression = useCallback((expr: DuckExpression) => {
      setDuckExpression(expr);
      if (onDuckExpressionChange) {
        onDuckExpressionChange(expr);
      }
    }, [onDuckExpressionChange]);

    const resolveCollisions = useCallback(
      (sourceId: string, centerX: number, centerY: number, intensity: number = 1): boolean => {
        let didHitAny = false;
        const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
        const minThreshold = isMobile ? 65 : 130;
        const maxStageX = typeof window !== 'undefined' ? Math.max(160, window.innerWidth * 0.44) : 400;
        const maxStageY = typeof window !== 'undefined' ? Math.max(140, window.innerHeight * 0.32) : 220;

        setLetters((prev) => {
          return prev.map((other) => {
            if (other.id === sourceId) return other;

            const otherEl = document.getElementById(`letter-${other.id}`);
            if (!otherEl) return other;

            const otherRect = otherEl.getBoundingClientRect();
            const otherCenterX = otherRect.left + otherRect.width / 2;
            const otherCenterY = otherRect.top + otherRect.height / 2;

            let dx = otherCenterX - centerX;
            let dy = otherCenterY - centerY;
            let dist = Math.sqrt(dx ** 2 + dy ** 2);

            if (dist < 1) {
              dx = (Math.random() - 0.5) * 50 || 30;
              dy = (Math.random() - 0.5) * 50 || 30;
              dist = Math.sqrt(dx ** 2 + dy ** 2);
            }

            if (dist < minThreshold) {
              didHitAny = true;
              const overlap = (minThreshold - dist) / minThreshold;
              const force = overlap * (isMobile ? 35 : 70) * Math.max(0.8, intensity);

              const pushX = (dx / dist) * force;
              const pushY = (dy / dist) * (force * 0.85);
              const wobbleAngle = (dx > 0 ? 10 : -10) * overlap * Math.max(0.8, intensity);

              onRipple(otherCenterX, otherCenterY, 55);

              return {
                ...other,
                posX: Math.max(-maxStageX, Math.min(maxStageX, other.posX + pushX)),
                posY: Math.max(-maxStageY, Math.min(maxStageY, other.posY + pushY)),
                wobble: wobbleAngle
              };
            }

            return other;
          });
        });

        // settle wobble rotation back to 0 without resetting posX and posY
        if (returnTimeoutRef.current) clearTimeout(returnTimeoutRef.current);
        returnTimeoutRef.current = setTimeout(() => {
          setLetters((prev) => prev.map((l) => ({ ...l, wobble: 0 })));
        }, 700);

        return didHitAny;
      },
      [onRipple]
    );

    const handleLetterDragStart = (id: string) => {
      setActiveGrabbedId(id);
    };

    const handleLetterDragEnd = (
      id: string,
      _e: MouseEvent | TouchEvent | PointerEvent,
      info: PanInfo
    ) => {
      setActiveGrabbedId(null);
      const speed = Math.sqrt(info.velocity.x ** 2 + info.velocity.y ** 2);
      const intensity = Math.min(2.8, Math.max(0.9, speed / 200));

      onSplash(info.point.x, info.point.y, intensity);

      const droppedEl = document.getElementById(`letter-${id}`);
      if (!droppedEl) return;
      const droppedRect = droppedEl.getBoundingClientRect();
      const droppedCenterX = droppedRect.left + droppedRect.width / 2;
      const droppedCenterY = droppedRect.top + droppedRect.height / 2;

      const maxStageX = typeof window !== 'undefined' ? Math.max(160, window.innerWidth * 0.44) : 400;
      const maxStageY = typeof window !== 'undefined' ? Math.max(140, window.innerHeight * 0.32) : 220;

      setLetters((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const nextX = Math.max(-maxStageX, Math.min(maxStageX, item.posX + info.offset.x));
            const nextY = Math.max(-maxStageY, Math.min(maxStageY, item.posY + info.offset.y));
            return {
              ...item,
              posX: nextX,
              posY: nextY,
              wobble: 0
            };
          }
          return item;
        })
      );

      resolveCollisions(id, droppedCenterX, droppedCenterY, intensity);

      setTimeout(() => {
        setLetters((prev) => prev.map((l) => ({ ...l, wobble: 0 })));
      }, 600);
    };

    const handleLetterDoubleClick = (id: string) => {
      setLetters((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              posX: 0,
              posY: 0,
              wobble: 0
            };
          }
          return item;
        })
      );
    };

    const handleDuckDrop = (clientX: number, clientY: number, velocity: number) => {
      onSplash(clientX, clientY, velocity);

      const didHit = resolveCollisions('duck', clientX, clientY, velocity * 1.3);

      if (didHit) {
        updateDuckExpression('impact');
        if (duckImpactTimeoutRef.current) clearTimeout(duckImpactTimeoutRef.current);
        duckImpactTimeoutRef.current = setTimeout(() => {
          updateDuckExpression('normal');
        }, 1100);
      } else {
        updateDuckExpression('normal');
      }

      setTimeout(() => {
        setLetters((prev) => prev.map((l) => ({ ...l, wobble: 0 })));
      }, 600);
    };

    const handleDuckSwim = (duckX: number, duckY: number) => {
      // ripple rate
      const now = performance.now();
      if (now - lastRippleTimeRef.current > 380) {
        lastRippleTimeRef.current = now;
        onRipple(duckX, duckY, 45);
      }

      let didHitLetter = false;

      // letter collision check with per-letter hit cooldown to prevent runaway acceleration
      setLetters((prev) => {
        let moved = false;
        const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
        const hitThreshold = isMobile ? 60 : 110;
        const maxStageX = typeof window !== 'undefined' ? Math.max(160, window.innerWidth * 0.44) : 400;
        const maxStageY = typeof window !== 'undefined' ? Math.max(140, window.innerHeight * 0.32) : 220;

        const updated = prev.map((letter) => {
          const lastHit = lastLetterHitTimeRef.current[letter.id] || 0;
          if (now - lastHit < 1100) return letter;

          const el = document.getElementById(`letter-${letter.id}`);
          if (!el) return letter;

          const rect = el.getBoundingClientRect();
          const letterCenterX = rect.left + rect.width / 2;
          const letterCenterY = rect.top + rect.height / 2;

          const dx = letterCenterX - duckX;
          const dy = letterCenterY - duckY;
          const dist = Math.sqrt(dx ** 2 + dy ** 2);

          if (dist < hitThreshold && dist > 0) {
            moved = true;
            didHitLetter = true;
            lastLetterHitTimeRef.current[letter.id] = now;

            const pushY = dy >= 0 ? (isMobile ? 14 : 26) : (isMobile ? -14 : -26);
            const pushX = dx >= 0 ? (isMobile ? 12 : 22) : (isMobile ? -8 : -14);
            const wobble = dy >= 0 ? 9 : -9;

            onRipple(letterCenterX, letterCenterY, 55);

            return {
              ...letter,
              posX: Math.max(-maxStageX, Math.min(maxStageX, letter.posX + pushX)),
              posY: Math.max(-maxStageY, Math.min(maxStageY, letter.posY + pushY)),
              wobble
            };
          }

          return letter;
        });

        return moved ? updated : prev;
      });

      if (didHitLetter) {
        updateDuckExpression('impact');
        if (duckImpactTimeoutRef.current) clearTimeout(duckImpactTimeoutRef.current);
        duckImpactTimeoutRef.current = setTimeout(() => {
          updateDuckExpression('normal');
        }, 900);

        if (returnTimeoutRef.current) clearTimeout(returnTimeoutRef.current);
        returnTimeoutRef.current = setTimeout(() => {
          setLetters((prev) => prev.map((l) => ({ ...l, wobble: 0 })));
        }, 800);
      }
    };

    useImperativeHandle(ref, () => ({
      handleDuckDrop,
      handleDuckSwim,
      resetLetters: () => {
        setLetters(INITIAL_LETTERS.map((item) => ({ ...item, posX: 0, posY: 0, wobble: 0 })));
      },
      duckExpression
    }));

    const word1 = letters.filter((l) => l.wordIdx === 0);
    const word2 = letters.filter((l) => l.wordIdx === 1);

    const renderLetter = (letter: LetterData) => {
      const isGrabbed = activeGrabbedId === letter.id;
      const phaseDelay = (letter.wordIdx * 7 + letter.letterIdx) * 0.18;

      return (
        <motion.div
          key={letter.id}
          id={`letter-${letter.id}`}
          drag
          dragMomentum={false}
          dragElastic={0}
          onDragStart={() => handleLetterDragStart(letter.id)}
          onDragEnd={(e, info) => handleLetterDragEnd(letter.id, e, info)}
          onDoubleClick={() => handleLetterDoubleClick(letter.id)}
          style={{ touchAction: 'none' }}
          animate={{
            x: letter.posX,
            y: letter.posY,
            rotate: isGrabbed ? (letter.letterIdx % 2 === 0 ? 5 : -5) : letter.wobble,
            scale: isGrabbed ? 1.2 : 1,
            zIndex: isGrabbed ? 60 : 20
          }}
          transition={{
            type: 'spring',
            stiffness: 180,
            damping: 18,
            mass: 0.8
          }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 1.22 }}
          className="relative inline-block cursor-grab active:cursor-grabbing select-none p-1 sm:p-2.5 mx-0.5 sm:mx-1.5 md:mx-2.5 pointer-events-auto"
        >
          <motion.div
            animate={
              isGrabbed
                ? { y: -16, rotate: 0 }
                : {
                  y: [0, -7, 0, 6, 0],
                  rotate: [0, -1.2, 0, 1.2, 0]
                }
            }
            transition={
              isGrabbed
                ? { type: 'spring', stiffness: 320, damping: 22 }
                : {
                  repeat: Infinity,
                  duration: 3.8,
                  delay: phaseDelay,
                  ease: 'easeInOut'
                }
            }
            className="relative"
          >
            <div className="absolute -bottom-4 left-1 right-1 h-4 bg-[#c4ad82]/40 rounded-full blur-[4px] transform scale-y-50" />
            <div className="absolute -bottom-3 left-2 right-2 h-3 bg-[#0284c7]/50 rounded-full blur-[3px]" />

            <span
              className="absolute top-1 sm:top-2 left-0.5 text-[40px] min-[390px]:text-[48px] sm:text-7xl md:text-8xl font-black text-[#041628] tracking-tight select-none pointer-events-none"
              aria-hidden="true"
            >
              {letter.char}
            </span>
            <span
              className="absolute top-0.5 sm:top-1.5 left-0.5 text-[40px] min-[390px]:text-[48px] sm:text-7xl md:text-8xl font-black text-[#0369a1] tracking-tight select-none pointer-events-none"
              aria-hidden="true"
            >
              {letter.char}
            </span>
            <span
              className="absolute top-0.5 left-0 text-[40px] min-[390px]:text-[48px] sm:text-7xl md:text-8xl font-black text-[#0284c7] tracking-tight select-none pointer-events-none"
              aria-hidden="true"
            >
              {letter.char}
            </span>

            <span className="relative z-10 block text-[40px] min-[390px]:text-[48px] sm:text-7xl md:text-8xl font-black text-white tracking-tight drop-shadow-[0_6px_16px_rgba(2,132,199,0.35)]">
              {letter.char}
            </span>
          </motion.div>
        </motion.div>
      );
    };

    return (
      <div className="relative z-20 w-full flex flex-col items-center justify-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-y-0.5 sm:gap-y-0 gap-x-4 sm:gap-x-8 md:gap-x-10 py-1 sm:py-6 max-w-full px-1">
          <div className="flex items-center justify-center">
            {word1.map(renderLetter)}
          </div>
          <div className="flex items-center justify-center">
            {word2.map(renderLetter)}
          </div>
        </div>
      </div>
    );
  }
);

HeroPhysicsStage.displayName = 'HeroPhysicsStage';
