import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Image as ImageIcon, Type, Layout, Youtube, Settings, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

export interface HotsiteConfig {
    global: {
        logoUrl: string;
        primaryColor: string;
        topMenu: { label: string; targetId: string }[];
    };
    blocks: any[];
}

function ImageUploadBox({ value, onChange, label, className = '' }: { value: string, onChange: (url: string) => void, label: string, className?: string }) {
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', e.target.files[0]);
        
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/upload/image`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: formData
            });
            if(res.ok) {
                const data = await res.json();
                // We use process.env.NEXT_PUBLIC_APP_URL to fully qualify the frontend URL,
                // or just rely on the relative `/uploads/...` if empty.
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                onChange(`${appUrl}${data.url}`);
                toast.success("Imagem enviada com sucesso!");
            } else {
                const err = await res.json();
                toast.error(err.detail || "Erro no upload");
            }
        } catch (error) {
            toast.error("Falha no envio da imagem.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className={`space-y-1.5 ${className}`}>
            <label className="text-xs font-medium text-slate-500">{label}</label>
            <div className="flex gap-2">
                <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white" placeholder="URL ou Upload..." />
                
                <label className={`shrink-0 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    <span className="text-sm font-medium hidden sm:block">Fazer Upload</span>
                    <input type="file" className="hidden" accept="image/jpeg, image/png, image/webp" onChange={handleUpload} />
                </label>
            </div>
            {value && (
                <div className="mt-2 h-20 w-32 rounded bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 overflow-hidden relative">
                    <img src={value} alt="Preview" className="w-full h-full object-cover" />
                </div>
            )}
        </div>
    );
}

interface Props {
    value: HotsiteConfig;
    onChange: (val: HotsiteConfig) => void;
}

export default function HotsiteBuilder({ value, onChange }: Props) {
    if (!value.global) {
        value = {
            global: { logoUrl: '', primaryColor: '#e11d48', topMenu: [] },
            blocks: []
        };
    }

    const updateGlobal = (field: string, val: any) => {
        onChange({ ...value, global: { ...value.global, [field]: val } });
    };

    const addMenuItem = () => {
        const newMenu = [...(value.global.topMenu || []), { label: '', targetId: '' }];
        updateGlobal('topMenu', newMenu);
    };

    const updateMenuItem = (index: number, field: string, val: string) => {
        const newMenu = [...value.global.topMenu];
        newMenu[index] = { ...newMenu[index], [field]: val };
        updateGlobal('topMenu', newMenu);
    };

    const removeMenuItem = (index: number) => {
        const newMenu = value.global.topMenu.filter((_, i) => i !== index);
        updateGlobal('topMenu', newMenu);
    };

    const addBlock = (type: string) => {
        const newBlock: any = { id: `block-${Date.now()}`, type, backgroundColor: '' };
        if (type === 'BANNER') {
            newBlock.imageUrl = '';
            newBlock.title = '';
            newBlock.subtitle = '';
        } else if (type === 'TEXT_IMAGE') {
            newBlock.layout = 'image_left';
            newBlock.title = '';
            newBlock.content = '';
            newBlock.imageUrl = '';
        } else if (type === 'VIDEO') {
            newBlock.videoUrl = '';
            newBlock.title = '';
        } else if (type === 'CAROUSEL') {
            newBlock.images = []; // Array of {url: string}
        } else if (type === 'HTML') {
            newBlock.content = '';
        }
        onChange({ ...value, blocks: [...(value.blocks || []), newBlock] });
    };

    const updateBlock = (index: number, field: string, val: any) => {
        const newBlocks = [...value.blocks];
        newBlocks[index] = { ...newBlocks[index], [field]: val };
        onChange({ ...value, blocks: newBlocks });
    };

    const removeBlock = (index: number) => {
        const newBlocks = value.blocks.filter((_, i) => i !== index);
        onChange({ ...value, blocks: newBlocks });
    };

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === value.blocks.length - 1) return;
        
        const newBlocks = [...value.blocks];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        const temp = newBlocks[index];
        newBlocks[index] = newBlocks[swapIndex];
        newBlocks[swapIndex] = temp;
        onChange({ ...value, blocks: newBlocks });
    };

    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{'list': 'ordered'}, {'list': 'bullet'}],
            [{'color': []}, {'background': []}],
            ['link', 'image', 'video'],
            ['clean']
        ]
    };

    return (
        <div className="space-y-8">
            {/* Global Settings */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 dark:bg-slate-900/50 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                    <Settings className="w-5 h-5 text-indigo-500" /> Configurações Globais
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="space-y-1.5 flex-1">
                        <ImageUploadBox 
                            label="URL / Imagem do Logo Principal" 
                            value={value.global.logoUrl} 
                            onChange={(url) => updateGlobal('logoUrl', url)} 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cor Primária (Hex)</label>
                        <div className="flex gap-4 items-center h-10">
                            <input
                                type="color"
                                value={value.global.primaryColor}
                                onChange={(e) => updateGlobal('primaryColor', e.target.value)}
                                className="h-10 w-20 rounded cursor-pointer"
                            />
                            <span className="text-sm text-slate-500 font-mono">{value.global.primaryColor}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Menu de Navegação (Topo)</label>
                        <button type="button" onClick={addMenuItem} className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium transition-colors dark:bg-indigo-900/30 dark:text-indigo-400">
                            <Plus className="w-3 h-3" /> Adicionar Link
                        </button>
                    </div>
                    {value.global.topMenu?.map((item, i) => (
                        <div key={i} className="flex gap-4 items-start bg-white p-3 rounded-xl border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
                            <div className="flex-1 grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    value={item.label}
                                    onChange={(e) => updateMenuItem(i, 'label', e.target.value)}
                                    placeholder="Rótulo (Ex: Detalhes)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                />
                                <input
                                    type="text"
                                    value={item.targetId}
                                    onChange={(e) => updateMenuItem(i, 'targetId', e.target.value)}
                                    placeholder="ID Alvo (Ex: block-123)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white font-mono"
                                />
                            </div>
                            <button type="button" onClick={() => removeMenuItem(i)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {(!value.global.topMenu || value.global.topMenu.length === 0) && (
                        <p className="text-xs text-slate-400 italic text-center py-2">Nenhum menu configurado.</p>
                    )}
                </div>
            </div>

            {/* Blocks Builder */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Layout className="w-5 h-5 text-indigo-500" /> Estrutura da Página
                    </h3>
                    
                    <div className="flex gap-2">
                        <select 
                            className="bg-white border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                            onChange={(e) => {
                                if (e.target.value) {
                                    addBlock(e.target.value);
                                    e.target.value = '';
                                }
                            }}
                            defaultValue=""
                        >
                            <option value="" disabled>+ Novo Bloco...</option>
                            <option value="BANNER">Banner Principal</option>
                            <option value="TEXT_IMAGE">Texto e Imagem</option>
                            <option value="CAROUSEL">Carrossel de Imagens</option>
                            <option value="VIDEO">Vídeo (Youtube)</option>
                            <option value="HTML">HTML Livre</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    {value.blocks?.map((block, i) => (
                        <div key={block.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm dark:bg-slate-900 dark:border-slate-800 transition-all hover:border-slate-300">
                            {/* Block Header */}
                            <div className="bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-between dark:bg-slate-800/50 dark:border-slate-700/50">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                        <button type="button" onClick={() => moveBlock(i, 'up')} disabled={i===0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                                        <button type="button" onClick={() => moveBlock(i, 'down')} disabled={i===value.blocks.length-1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                                    </div>
                                    <div className="font-semibold text-sm text-slate-700 flex items-center gap-2 dark:text-slate-300">
                                        {block.type === 'BANNER' && <><ImageIcon className="w-4 h-4 text-emerald-500"/> Banner</>}
                                        {block.type === 'TEXT_IMAGE' && <><Layout className="w-4 h-4 text-blue-500"/> Texto e Imagem</>}
                                        {block.type === 'CAROUSEL' && <><ImageIcon className="w-4 h-4 text-indigo-500"/> Carrossel de Imagens</>}
                                        {block.type === 'VIDEO' && <><Youtube className="w-4 h-4 text-rose-500"/> Vídeo</>}
                                        {block.type === 'HTML' && <><Type className="w-4 h-4 text-orange-500"/> HTML Livre</>}
                                    </div>
                                    <span className="text-xs font-mono text-slate-400 bg-slate-200 px-2 py-0.5 rounded dark:bg-slate-700">{block.id}</span>
                                </div>
                                <button type="button" onClick={() => removeBlock(i)} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Block Payload */}
                            <div className="p-5 space-y-4">
                                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/60 w-fit">
                                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Cor de Fundo (Opcional)</label>
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="color"
                                            value={block.backgroundColor || '#ffffff'}
                                            onChange={(e) => updateBlock(i, 'backgroundColor', e.target.value)}
                                            className="h-7 w-10 rounded cursor-pointer border-0 p-0"
                                        />
                                        {block.backgroundColor && (
                                            <button 
                                                type="button" 
                                                onClick={() => updateBlock(i, 'backgroundColor', '')} 
                                                className="text-xs text-rose-500 hover:text-rose-600 font-medium"
                                            >
                                                Limpar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {block.type === 'BANNER' && (
                                    <>
                                        <ImageUploadBox 
                                            label="Imagem de Fundo (Banner)" 
                                            value={block.imageUrl || ''} 
                                            onChange={(url) => updateBlock(i, 'imageUrl', url)} 
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-500">Título Principal (H1)</label>
                                                <input type="text" value={block.title || ''} onChange={(e) => updateBlock(i, 'title', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-500">Subtítulo</label>
                                                <input type="text" value={block.subtitle || ''} onChange={(e) => updateBlock(i, 'subtitle', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {block.type === 'TEXT_IMAGE' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5 flex-1">
                                                <label className="text-xs font-medium text-slate-500">Layout</label>
                                                <select value={block.layout || 'image_left'} onChange={(e) => updateBlock(i, 'layout', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white">
                                                    <option value="image_left">Imagem na Esquerda</option>
                                                    <option value="image_right">Imagem na Direita</option>
                                                </select>
                                            </div>
                                            <div className="flex-1">
                                                <ImageUploadBox 
                                                    label="Imagem (Card)" 
                                                    value={block.imageUrl || ''} 
                                                    onChange={(url) => updateBlock(i, 'imageUrl', url)} 
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-slate-500">Título</label>
                                            <input type="text" value={block.title || ''} onChange={(e) => updateBlock(i, 'title', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-slate-500">Conteúdo (Texto Rico)</label>
                                            <div className="bg-white dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 [&_.ql-toolbar]:bg-slate-50 dark:[&_.ql-toolbar]:bg-slate-900 [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-800 [&_.ql-editor]:min-h-[150px] [&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-900 dark:[&_.ql-editor]:text-white dark:[&_.ql-picker-label]:text-slate-300 dark:[&_.ql-stroke]:stroke-slate-300 dark:[&_.ql-fill]:fill-slate-300 dark:[&_.ql-picker-options]:bg-slate-900 dark:[&_.ql-picker-item]:text-slate-300">
                                                <ReactQuill 
                                                    theme="snow"
                                                    value={block.content || ''}
                                                    onChange={(value) => updateBlock(i, 'content', value)}
                                                    modules={quillModules}
                                                    placeholder="Escreva o conteúdo detalhado..."
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {block.type === 'CAROUSEL' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Imagens do Carrossel ({block.images?.length || 0}/10)</h4>
                                            <button 
                                                type="button" 
                                                disabled={(block.images?.length || 0) >= 10}
                                                onClick={() => {
                                                    const newImages = [...(block.images || []), {url: ''}];
                                                    updateBlock(i, 'images', newImages);
                                                }}
                                                className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium transition-colors disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-400"
                                            >
                                                <Plus className="w-3 h-3" /> Adicionar Imagem
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            {block.images?.map((img: any, imgIdx: number) => (
                                                <div key={imgIdx} className="flex gap-3 items-start bg-slate-50 p-3 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                                                    <div className="flex-1">
                                                        <ImageUploadBox 
                                                            label={`Imagem ${imgIdx + 1}`} 
                                                            value={img.url} 
                                                            onChange={(url) => {
                                                                const newImages = [...block.images];
                                                                newImages[imgIdx].url = url;
                                                                updateBlock(i, 'images', newImages);
                                                            }} 
                                                        />
                                                    </div>
                                                    <button type="button" onClick={() => {
                                                        const newImages = block.images.filter((_: any, idx: number) => idx !== imgIdx);
                                                        updateBlock(i, 'images', newImages);
                                                    }} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg mt-6">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(!block.images || block.images.length === 0) && (
                                                <p className="text-xs text-slate-400 italic text-center py-4 border border-dashed rounded-xl dark:border-slate-800">Nenhuma imagem adicionada no carrossel.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {block.type === 'VIDEO' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-slate-500">URL do Vídeo (Youtube ou MP4)</label>
                                            <input type="text" value={block.videoUrl || ''} onChange={(e) => updateBlock(i, 'videoUrl', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-slate-500">Título Opcional (acima do vídeo)</label>
                                            <input type="text" value={block.title || ''} onChange={(e) => updateBlock(i, 'title', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                                        </div>
                                    </>
                                )}

                                {block.type === 'HTML' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">Editor de Texto</label>
                                        <div className="bg-white dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 [&_.ql-toolbar]:bg-slate-50 dark:[&_.ql-toolbar]:bg-slate-900 [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-800 [&_.ql-editor]:min-h-[150px] [&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-900 dark:[&_.ql-editor]:text-white dark:[&_.ql-picker-label]:text-slate-300 dark:[&_.ql-stroke]:stroke-slate-300 dark:[&_.ql-fill]:fill-slate-300 dark:[&_.ql-picker-options]:bg-slate-900 dark:[&_.ql-picker-item]:text-slate-300">
                                            <ReactQuill 
                                                theme="snow"
                                                value={block.content || ''}
                                                onChange={(value) => updateBlock(i, 'content', value)}
                                                modules={quillModules}
                                                placeholder="Crie a seção com formatação de texto livre..."
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    {(!value.blocks || value.blocks.length === 0) && (
                        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl dark:border-slate-800 flex flex-col items-center justify-center">
                            <Layout className="w-12 h-12 text-slate-300 mb-3" />
                            <p className="text-slate-500 font-medium">Esta Landing Page está vazia.</p>
                            <p className="text-sm text-slate-400 mt-1">Adicione o primeiro bloco para começar a construir!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
