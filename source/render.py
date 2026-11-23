"""Render the four independently animated scenes and their original score.

Requires Python with Pillow and NumPy, FFmpeg with libx264, and Open Sans.
Run python source/render.py from the checkout.
"""
from functools import lru_cache
from pathlib import Path
import math
import os
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = (ROOT / 'dist' if (ROOT / 'dist').is_dir() else ROOT) / 'assets'
OUT.mkdir(exist_ok=True)
FONTS = Path(os.environ.get('SPORTAPP_FONTS', '/usr/share/fonts/truetype/open-sans'))
FPS, DURATION = 24, 32
RED, WHITE = '#ff3346', '#f6f5f1'
LABELS = ['СОВМЕСТНЫЕ ТРЕНИРОВКИ', 'ПРИГЛАШЕНИЕ', 'ТРЕНИРОВКА', 'РЕЗУЛЬТАТЫ']
TITLES = [('СИЛЬНЕЕ', 'ВМЕСТЕ.'), ('ЗОВИ', 'ДРУГА.'), ('ДЕРЖИ', 'ТЕМП.'), ('ОБЩИЙ', 'ФИНИШ.')]
COPIES = [
    ('Хочешь заниматься с другом, но нет', 'возможности ходить в зал?'),
    ('Выбери тренировку, нажми «Совместная»', 'и отправь другу приглашение.'),
    ('Каждый у себя дома. Один план на двоих.', 'Отмечайте подходы каждый в своём темпе.'),
    ('Время, упражнения и XP каждого участника', 'собраны на одном экране.'),
]

@lru_cache(None)
def font(size, face='Regular'):
    return ImageFont.truetype(str(FONTS / f'OpenSans-{face}.ttf'), size)

def text(draw, xy, content, size, color=WHITE, face='Regular', anchor='lt'):
    draw.text(xy, content, font=font(size, face), fill=color, anchor=anchor)

def clamp(x): return max(0, min(1, x))
def ease(x): return 1 - (1 - clamp(x)) ** 3

@lru_cache(None)
def headline(content, size, color):
    f = font(size, 'ExtraBoldItalic')
    left, top, right, bottom = f.getbbox(content)
    img = Image.new('RGBA', (right-left+12, bottom-top+8))
    ImageDraw.Draw(img).text((6-left, 4-top), content, fill=color, font=f)
    return img.resize((round(img.width * .81), img.height), Image.Resampling.LANCZOS)

def tracking(draw, xy, content, size, fill, extra=2.1):
    x, y = xy
    for char in content:
        text(draw, (x,y), char, size, fill, 'Bold')
        x += font(size,'Bold').getlength(char)+extra

def img_cover(im, size, focus=(.5,.5)):
    return ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=focus)

def make_audio(path):
    rate=44100
    out=np.zeros(DURATION*rate, dtype=np.float32)
    rng=np.random.default_rng(149)
    def mix(start, source, level):
        i=round(start*rate)
        n=min(len(source),len(out)-i)
        if n>0: out[i:i+n]+=source[:n]*level
    def samples(duration): return np.arange(round(duration*rate))/rate
    for beat in range(64):
        sec=beat*.5
        t=samples(.37)
        kick=np.sin(2*np.pi*(46*t+2.3*(1-np.exp(-32*t))))*np.exp(-11*t)
        mix(sec,kick,.46)
        n=beat%16
        base=[55,55,65.41,49][(beat//4)%4]
        for offset in ([0,.375] if n%4 in (2,3) else [0]):
            t=samples(.29)
            bass=(np.sin(2*np.pi*base*t)+.2*np.sin(4*np.pi*base*t))*np.minimum(t*120,1)*np.exp(-10*t)
            mix(sec+offset,bass,.22)
        if beat%4 in (1,3):
            t=samples(.15); noise=rng.normal(0,1,len(t))
            mix(sec, (noise*.48+np.sin(2*np.pi*166*t)*.28)*np.exp(-26*t),.24)
        for off in (.0,.25):
            t=samples(.07)
            noise=np.diff(rng.normal(0,1,len(t)+1))
            mix(sec+off,noise*np.exp(-75*t),.085 if off else .048)
        if beat%4 in (0,3):
            t=samples(.62)
            pitch=[220,261.63,196,293.66][beat//4%4]*(2 if beat%4==3 else 1)
            note=(np.sin(2*np.pi*pitch*t)+.3*np.sin(4*np.pi*pitch*t))*np.minimum(1,t*75)*np.exp(-7*t)
            mix(sec+.25,note,.12)
    for sec in [8,16,24]:
        t=samples(.32)
        mix(sec-.32, rng.normal(0,1,len(t))*(t/.32)**3,.075)
    ramp=int(rate*.55)
    out[:ramp]*=np.linspace(0,1,ramp)
    out[-ramp:]*=np.linspace(1,0,ramp)
    with wave.open(str(path),'wb') as w:
        w.setparams((1,2,rate,0,'NONE',''))
        w.writeframes((np.tanh(out*1.2)*26500).astype('<i2').tobytes())

def synth_background(size, final=False):
    w,h=size
    y,x=np.mgrid[0:h,0:w]
    g=np.exp(-(((x/w-.76)/.32)**2+((y/h-.43)/.78)**2))
    n=np.random.default_rng(7).normal(0,2.7,(h,w))
    if final:
        channels=[13+207*g+n,11+18*g+n,15+37*g+n]
    else:
        channels=[12+72*g+n,13+6*g+n,16+18*g+n]
    im=Image.fromarray(np.uint8(np.clip(np.stack(channels,-1),0,255)))
    d=ImageDraw.Draw(im,'RGBA')
    for i in range(-3,12):
        pos=w*(.20+i*.115)
        d.line((pos,-30,pos-h*.78,h+10),fill=(255,120,125,35),width=1)
    return im

def phone(state):
    w,h=360,525
    im=Image.new('RGBA',(w+20,h+20))
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((6,4,w+6,h+4),41,fill='#111318',outline='#77797e',width=4)
    d.rounded_rectangle((13,11,w-1,h-4),35,fill='#18202b',outline='#414550',width=2)
    d.rounded_rectangle((134,16,225,34),10,fill='#08090c')
    text(d,(36,25),'9:41',13,WHITE,'Bold')
    for j in range(3):d.rectangle((300+j*6,33-j*3,303+j*6,35),fill=WHITE)
    text(d,(35,76),'ТРЕНИРОВКА',24,WHITE,'ExtraBold')
    text(d,(36,122),'Упражнения',17,'#c3cbd8','Bold')
    for i,title in enumerate(['Отжимания от пола','Приседания без веса','Планка на локтях']):
        y=157+i*62
        d.rounded_rectangle((30,y,337,y+51),12,fill='#273140')
        d.rounded_rectangle((40,y+9,74,y+42),9,fill='#3a4553')
        text(d,(57,y+25),str(i+1),17,WHITE,'Bold','mm')
        text(d,(86,y+11),title,16,WHITE,'Semibold')
        text(d,(86,y+32),'2 подхода',12,'#a2adbd')
    d.rounded_rectangle((30,358,199,403),12,fill='#dc143c')
    text(d,(115,380),'Совместная',17,WHITE,'Bold','mm')
    d.rounded_rectangle((208,358,337,403),12,fill='#dc143c')
    text(d,(271,380),'Старт',17,WHITE,'Bold','mm')
    if state:
        shade=Image.new('RGBA',im.size)
        ImageDraw.Draw(shade).rounded_rectangle((13,11,w-1,h-4),35,fill=(0,0,0,130))
        im.alpha_composite(shade);d=ImageDraw.Draw(im)
        d.rounded_rectangle((26,150,340,371),20,fill='#222b38',outline='#4c5562',width=2)
        text(d,(47,177),'Выберите друга',23,WHITE,'Bold')
        d.rounded_rectangle((44,222,322,282),12,fill='#313c4c')
        d.ellipse((53,234,89,270),fill='#dc143c')
        text(d,(71,250),'А',17,WHITE,'Bold','mm')
        text(d,(101,232),'Артём',16,WHITE,'Bold')
        text(d,(101,255),'Уровень 3 · 240 XP',12,'#acb7c4')
        d.line((281,251,287,257,298,242),fill=RED,width=3)
        d.rounded_rectangle((45,307,170,349),10,fill='#38424f')
        text(d,(108,328),'Закрыть',15,WHITE,'Bold','mm')
        d.rounded_rectangle((178,307,321,349),10,fill='#dc143c')
        text(d,(250,328),'Отправить',15,WHITE,'Bold','mm')
    d.rounded_rectangle((136,h-22,230,h-18),3,fill='#e2e6ec')
    return im.rotate(-7,Image.Resampling.BICUBIC,expand=True)

def result_card():
    im=Image.new('RGBA',(407,243))
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((1,1,405,241),17,fill='#15161b',outline='#4f434b',width=2)
    d.rounded_rectangle((20,20,24,41),2,fill=RED)
    text(d,(36,21),'Тренировка завершена!',19,WHITE,'Bold')
    for i,(name,time) in enumerate([('Вы','12:08'),('Артём','12:16')]):
        y=61+88*i
        text(d,(21,y),name,15,'#d3d0d4','Bold')
        for j,(label,value) in enumerate([('Время',time),('Упражнений','3/3'),('XP','+30')]):
            x=22+125*j
            text(d,(x,y+23),label,12,'#a5a3a9')
            text(d,(x,y+41),value,20,WHITE if j<2 else RED,'Bold')
    return im

def emblem():
    icon=Image.open(OUT/'icon.png').convert('RGBA')
    bounds=icon.getbbox()
    icon=icon.crop(bounds).resize((320,320),Image.Resampling.LANCZOS)
    tile=Image.new('RGBA',(390,390))
    d=ImageDraw.Draw(tile)
    for i in range(18):
        d.ellipse((39-i*.8,50-i*.85,351-i*.8,362-i*.85),fill=(70+i*3,3+i,16+i,255))
    tile.alpha_composite(icon,(20,20))
    return tile.rotate(-12,Image.Resampling.BICUBIC,expand=False)

def sized(im, scale):
    return im.resize((max(1,int(im.width*scale)),max(1,int(im.height*scale))),Image.Resampling.LANCZOS)

class Film:
    def __init__(self,vertical):
        self.vertical=vertical
        self.w,self.h=(720,960) if vertical else (1440,640)
        w,h=self.w,self.h
        self.bg=[]
        for name in ['portrait','exercise']:
            im=Image.open(HERE/(name+'.webp')).convert('RGB')
            size=(w+64, h+32)
            if vertical:
                top=img_cover(im,(size[0],int(h*.65)),(.8,.34 if name=='portrait' else .78))
                bg=Image.new('RGB',size,(10,10,12));bg.paste(top)
                shade=Image.new('RGBA',size)
                d=ImageDraw.Draw(shade)
                for y in range(int(h*.36),int(h*.65)):
                    a=clamp((y-h*.36)/(h*.29))
                    d.line((0,y,size[0],y),fill=(10,10,12,int(a*255)))
                bg.paste(shade,mask=shade.getchannel('A'))
            else:
                bg=img_cover(im,size,(.53,.30 if name=='portrait' else .68))
            self.bg.append(bg)
        self.synth=[synth_background((w+64,h+32),i==1) for i in range(2)]
        cardscale=.87 if vertical else .99
        self.phones=[sized(phone(i),cardscale) for i in range(2)]
        self.results=sized(result_card(),.77 if vertical else .94)
        self.emblem=sized(emblem(),.84 if vertical else 1.03)
        self.shade=Image.new('RGBA',(w,h))
        d=ImageDraw.Draw(self.shade)
        if not vertical:
            for x in range(int(w*.59)):
                a=(1-clamp((x-w*.20)/(w*.39)))*.27
                d.line((x,0,x,h),fill=(5,6,8,int(255*a)))
        # Large, cropped red slashes anchor the frame to the right-hand edge.
        self.rails=Image.new('RGBA',(w,h))
        d=ImageDraw.Draw(self.rails)
        for dx,width,alpha in [(0,100,167),(134,34,199)]:
            x=w-78+dx
            d.polygon([(x,h*.39),(x+width,h*.39),(x+width-h*.305,h),(x-h*.305,h)],fill=(246,27,54,alpha))
    def frame(self,seconds,art=False):
        s=min(3,int(seconds//8)); t=seconds-s*8
        w,h=self.w,self.h; v=self.vertical
        source=[self.bg[0],self.synth[0],self.bg[1],self.synth[1]][s]
        pan=int((t/8)*(35 if s%2==0 else 18))
        im=source.crop((pan,4+int(t),pan+w,4+int(t)+h)).convert('RGBA')
        if s in (0,2):
            im.alpha_composite(self.shade)
            im.alpha_composite(self.rails)
        if s==1:
            ph=self.phones[int(t>2.1 or art)]
            x=(w-ph.width)//2+45 if v else int(w*.58)
            y=(-23 if v else 53)+int((1-ease(t/.9))*50+6*math.sin(t*.55))
            im.alpha_composite(ph,(x,y))
            if t>4.9 and not art:
                d=ImageDraw.Draw(im)
                cx=x+round(ph.width*.57);cy=y+round(ph.height*.68)
                width=int(130*ease((t-4.9)/.35))
                d.rounded_rectangle((cx-width,cy-22,cx+width,cy+22),14,fill='#dc143c')
                if width>118:text(d,(cx,cy),'Приглашение отправлено',16,WHITE,'Bold','mm')
        if s==2 and not art:
            d=ImageDraw.Draw(im)
            x=int(w*(.67 if not v else .08));y=int(h*(.65 if not v else .31))
            stamp=f'00:{5+int(t):02d}'
            d.rounded_rectangle((x,y,x+159,y+63),12,fill=(22,23,26,235),outline=(119,115,118),width=1)
            text(d,(x+15,y+10),'ОТЖИМАНИЯ',12,'#b2b1b8','Bold')
            text(d,(x+15,y+26),stamp,26,WHITE,'ExtraBold')
            d.line((x+105,y+42,x+140,y+42),fill=RED,width=3)
        if s==3:
            e=self.emblem
            x=int(w*(.54 if v else .61))- (int(e.width*.22) if v else 0)
            y=(2 if v else 0)+int(7*math.sin(t*.66))
            im.alpha_composite(e,(x,y))
            if not art:
                rc=self.results
                x=int(w*.55) if not v else int(w*.13)
                y=(300 if not v else 217)+int((1-ease(t/.75))*42)
                im.alpha_composite(rc,(x,y))
        if art:
            return im.convert('RGB')
        d=ImageDraw.Draw(im)
        left=49 if v else 78
        top=467 if v else 125
        fsize=111 if v else 128
        reveal=(1-ease(t/.52))*35 if s else 0
        y=top+int(reveal)
        kicker=13 if v else 14
        d.line((left,y+7,left+33,y+7),fill=RED,width=3)
        ending=s==3 and t>=4.5
        label='ТРЕНИРУЙТЕСЬ ВМЕСТЕ' if ending else LABELS[s]
        tracking(d,(left+45,y),label,kicker,'#efefef',2.3)
        y+=38 if v else 39
        for i,line in enumerate(('ТВОЙ ХОД.', 'SPORTAPP.') if ending else TITLES[s]):
            word=headline(line,fsize,RED if i else WHITE)
            im.alpha_composite(word,(left-7, y+int((1-ease((t-i*.07)/.5))*14) if s else y))
            y+=word.height-3
        y+=15
        for i,line in enumerate(('Открывай SportApp и пригласи друга', 'на первую совместную тренировку.') if ending else COPIES[s]):
            text(d,(left,y+i*(30 if v else 31)),line,23 if v else 22,'#e4e3e4')
        if s>0 and t<.18:
            progress=t/.18
            edge=int(w*progress)
            d.polygon([(edge-320,0),(edge+20,0),(edge-170,h),(edge-510,h)],fill=RED)
        return im.convert('RGB')
    def export(self,audio):
        tag='portrait' if self.vertical else 'wide'
        self.frame(0).save(OUT/f'poster-{tag}.webp',quality=90)
        if not self.vertical:
            for i in range(4):
                thumb=self.frame(i*8+3,art=True)
                x=[.75,.77,.61,.78][i]
                crop=img_cover(thumb,(620,264),(x,.47))
                if i==1:
                    crop=img_cover(self.phones[1].convert('RGBA'),(330,264),(.5,.45))
                    base=img_cover(self.synth[0],(620,264),(.8,.5))
                    base.paste(crop,(140,0),crop)
                    crop=base
                if i==3:
                    base=img_cover(self.synth[1],(620,264),(.9,.5))
                    em=sized(self.emblem,.73)
                    base.paste(em,(174,-12),em)
                    crop=base
                crop.save(OUT/f'scene-{i+1}.webp',quality=85)
        cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-s',f'{self.w}x{self.h}','-r',str(FPS),'-i','-','-i',str(audio),'-c:v','libx264','-threads','3','-preset','fast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-t',str(DURATION),str(OUT/f'film-{tag}.mp4')]
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        try:
            for n in range(FPS*DURATION):
                process.stdin.write(self.frame(n/FPS).tobytes())
        finally:
            process.stdin.close()
        if process.wait()!=0: raise RuntimeError('FFmpeg export failed')

if __name__=='__main__':
    with tempfile.TemporaryDirectory() as directory:
        audio=Path(directory)/'score.wav'
        make_audio(audio)
        for vertical in [False,True]:
            Film(vertical).export(audio)
