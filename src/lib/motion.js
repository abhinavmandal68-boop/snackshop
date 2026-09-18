export const quickTransition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
export const drawerTransition = { type: 'spring', stiffness: 360, damping: 36 }
export const press = { scale: 0.98 }
export const reveal = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: quickTransition,
}
