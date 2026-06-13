import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { submitVideoGenerationTask, VideoTaskSubmissionError } from '@/lib/videoTaskSubmission';

export const runtime = 'nodejs';

function publicTask(task: any) {
  if (!task) return task;
  const { providerRaw, ...safeTask } = task;
  return safeTask;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const formData = await request.formData();
  const prompt = String(formData.get('prompt') || '').trim();
  const model = String(formData.get('model') || 'seedance_2_0');
  const aspectRatio = String(formData.get('aspectRatio') || formData.get('ratio') || '16:9');
  const duration = Number(formData.get('duration') || 5);
  const functionMode = String(formData.get('function_mode') || 'omni_reference');
  const image = formData.get('image');
  const referenceFiles = formData
    .getAll('references')
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (!prompt) {
    return NextResponse.json({ message: '请输入提示词' }, { status: 400 });
  }
  const fallbackImage = image instanceof File && image.size > 0 ? image : null;
  const allReferences = referenceFiles.length > 0 ? referenceFiles : fallbackImage ? [fallbackImage] : [];
  const hasVisualReference = allReferences.some(
    (file) => file.type.startsWith('image/') || file.type.startsWith('video/')
  );

  if (allReferences.length === 0) {
    return NextResponse.json({ message: '请先上传参考素材' }, { status: 400 });
  }
  if (!hasVisualReference) {
    return NextResponse.json({ message: '音频不能单独作为参考，请至少上传一张图片或一个视频' }, { status: 400 });
  }

  try {
    const task = await submitVideoGenerationTask({
      userId: user!.id,
      prompt,
      model,
      aspectRatio,
      duration: Number.isFinite(duration) ? duration : 5,
      functionMode,
      taskType: 'image-to-video',
      image: fallbackImage,
      referenceFiles: allReferences
    });
    return NextResponse.json({ task: publicTask(task) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '视频任务提交失败';
    const status = error instanceof VideoTaskSubmissionError ? error.status : 500;
    return NextResponse.json({ message }, { status });
  }
}
