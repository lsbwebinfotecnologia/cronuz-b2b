export const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return `${apiUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
};
