import JobLive from '@/components/JobLive';
export default async function JobPage({ params }) {
  const { id } = await params;
  return <JobLive id={id} />;
}
