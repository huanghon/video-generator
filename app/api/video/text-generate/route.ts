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

  const body = await request.json().catch(() => null);
  const prompt = String(body?.prompt || '').trim();
  const model = String(body?.model || 'seedance_2_0');
  const aspectRatio = String(body?.aspectRatio || body?.ratio || '16:9');
  const duration = Number(body?.duration || 5);

  if (!prompt) {
    return NextResponse.json({ message: '请输入视频提示词' }, { status: 400 });
  }

  try {
    const task = await submitVideoGenerationTask({
      userId: user!.id,
      prompt,
      model,
      aspectRatio,
      duration: Number.isFinite(duration) ? duration : 5,
      taskType: 'text-to-video'
    });

    return NextResponse.json({ task: publicTask(task) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '视频任务提交失败';
    const status = error instanceof VideoTaskSubmissionError ? error.status : 500;
    return NextResponse.json({ message }, { status });
  }
}
