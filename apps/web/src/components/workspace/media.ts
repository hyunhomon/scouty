export async function readVideoDuration(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video")
      video.preload = "metadata"
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          reject(new Error("영상 길이를 확인하지 못했어요."))
          return
        }
        resolve(Math.ceil(video.duration))
      }
      video.onerror = () => reject(new Error("영상 파일을 읽지 못했어요."))
      video.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
