import { useState, useRef, useCallback } from 'react'
import { getSignature } from '../lib/api'

export function useZoom() {
  const [status, setStatus] = useState('idle') // idle | loading | joined | error | left
  const [error, setError] = useState(null)
  const zoomRef = useRef(null)

  const join = useCallback(async ({ meetingNumber, password = '', userName, userEmail, role = 0 }) => {
    setStatus('loading')
    setError(null)

    try {
      // Dynamically import Zoom SDK (large bundle, only load when needed)
      const { ZoomMtg } = await import('@zoom/meetingsdk')
      zoomRef.current = ZoomMtg

      ZoomMtg.preLoadWasm()
      ZoomMtg.prepareWebSDK()

      // Get signature from our server
      const { signature, sdkKey } = await getSignature({ meetingNumber, role })

      await new Promise((resolve, reject) => {
        ZoomMtg.init({
          leaveUrl: window.location.href,
          patchJsMedia: true,
          leaveOnPageUnload: true,
          success: () => {
            ZoomMtg.join({
              signature,
              sdkKey,
              meetingNumber,
              userName,
              userEmail: userEmail || '',
              passWord: password,
              success: () => {
                setStatus('joined')
                resolve()
              },
              error: (err) => {
                console.error('Join error:', err)
                setError(err?.errorMessage || JSON.stringify(err))
                setStatus('error')
                reject(err)
              },
            })
          },
          error: (err) => {
            console.error('Init error:', err)
            setError(err?.errorMessage || JSON.stringify(err))
            setStatus('error')
            reject(err)
          },
        })
      })
    } catch (err) {
      console.error('Zoom hook error:', err)
      setError(err.message)
      setStatus('error')
    }
  }, [])

  const leave = useCallback(() => {
    if (zoomRef.current) {
      try { zoomRef.current.leaveMeeting({}) } catch (e) { /* ignore */ }
    }
    setStatus('left')
  }, [])

  return { status, error, join, leave }
}
