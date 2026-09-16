import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const expo = 'expo.out'
export const motionEase = [0.22, 1, 0.36, 1]

export function fadeUp(target, vars = {}) {
  return gsap.fromTo(
    target,
    { y: 48, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 1.05,
      ease: expo,
      stagger: 0.08,
      ...vars,
    },
  )
}

export function clipReveal(target, vars = {}) {
  return gsap.fromTo(
    target,
    { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.08 },
    {
      clipPath: 'inset(0% 0% 0% 0%)',
      scale: 1,
      duration: 1.25,
      ease: 'power4.out',
      ...vars,
    },
  )
}

export function killTriggers(scope) {
  ScrollTrigger.getAll().forEach((trigger) => {
    if (!scope || scope.contains(trigger.trigger) || trigger.trigger === scope) {
      trigger.kill()
    }
  })
}
