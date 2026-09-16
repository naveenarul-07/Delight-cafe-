import { motion } from 'framer-motion'
import { motionEase } from '../utils/animations.js'

export default function PageTransition({ children }) {
  return (
    <motion.main
      id="main"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.55, ease: motionEase }}
    >
      {children}
    </motion.main>
  )
}
