import dynamic from 'next/dynamic';

const ClientMap = dynamic(() => import('@/components/Map'), { ssr: false });

export default function HomePage() {
  return <ClientMap />;
}
