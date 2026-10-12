import qrcode from 'qrcode-generator'
import { useMessages } from './i18n.ts'

/** The results QR pushed from the desk ("Pokaż QR"), with the red frame of 2025. */
export function QrCode({
  url,
  className = 'w-24 h-24',
}: {
  readonly url: string
  readonly className?: string
}) {
  const { t } = useMessages()
  const code = qrcode(0, 'M')
  code.addData(url)
  code.make()
  return (
    <div
      className={
        'qr bg-white p-1 border-2 border-primary-red rounded shadow-[0_0_20px_rgba(220,20,60,0.45)] ' +
        className
      }
      role="img"
      aria-label={t('a11y.qr')}
      data-url={url}
      // The generator returns trusted SVG markup built from its own matrix.
      dangerouslySetInnerHTML={{ __html: code.createSvgTag({ cellSize: 6, scalable: true }) }}
    />
  )
}
