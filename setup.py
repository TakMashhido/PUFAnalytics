from setuptools import setup, find_packages

setup(
    name='pufanalytics',
    version='1.0.0',
    packages=find_packages(),
    description='A library for analyzing PUF metrics',
    author='Koustav Kumar Mondal',
    author_email='erkoustavkumar@gmail.com',
    url='https://github.com/TakMashhido/PUFAnalytics',
    classifiers=[
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.6',
)
