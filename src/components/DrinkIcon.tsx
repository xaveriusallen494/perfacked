import { Beer, Wine, Martini, GlassWater } from 'lucide-react'
import Image from 'next/image'

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Beer,
  Wine,
  Martini,
  GlassWater,
}

type DrinkIconProps = {
  icon: string
  color?: string
  imageUrl?: string | null
  /** Icon size in px — used for both image and icon fallback */
  size?: number
  className?: string
}

export function DrinkIcon({ icon, color, imageUrl, size = 24, className }: DrinkIconProps) {
  const containerSize = size + 12
  const iconSizeClass = size <= 16 ? 'w-4 h-4' : size <= 20 ? 'w-5 h-5' : 'w-6 h-6'
  const imgSize = Math.round(size * 1.8)

  if (imageUrl) {
    return (
      <div
        className={`relative flex items-center justify-center rounded-xl overflow-hidden ${className ?? ''}`}
        style={{ width: containerSize, height: containerSize }}
      >
        <Image
          src={imageUrl}
          alt=""
          width={imgSize * 3}
          height={imgSize * 3}
          quality={95}
          unoptimized
          className="object-contain drop-shadow-sm"
          style={{ width: imgSize, height: imgSize }}
        />
      </div>
    )
  }

  const IconComponent = ICON_MAP[icon] || GlassWater
  return (
    <div
      className={`flex items-center justify-center rounded-xl ${className ?? ''}`}
      style={{
        width: containerSize,
        height: containerSize,
        color: color,
        backgroundColor: color ? `${color}12` : undefined,
      }}
    >
      <IconComponent className={iconSizeClass} />
    </div>
  )
}
