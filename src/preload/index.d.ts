import type { VideoApi } from './index'

declare global {
    interface Window {
        videoApi: VideoApi
    }
}

export {}
